import { TRPCError } from '@trpc/server'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role'
import type { SubmissionsBulkReviewOutput } from '@/shared/schemas'
import {
  submissionsBulkReviewInputSchema,
  submissionsBulkReviewOutputSchema,
  submissionsCreateInputSchema,
  submissionsCreateOutputSchema,
  submissionsListIdsInputSchema,
  submissionsListIdsOutputSchema,
  submissionsListInputSchema,
  submissionsListOutputSchema,
  submissionsReviewInputSchema,
  submissionsReviewOutputSchema,
  submissionsUpdatePayloadInputSchema,
  submissionsUpdatePayloadOutputSchema,
} from '@/shared/schemas'
import { slugify } from '@/shared/slug'
import { clientIp } from '../client-ip'
import { findPossibleDuplicates, type DuplicateCandidate } from '../duplicate-check'
import { internalError } from '../errors'
import { geocodeAddress } from '../geocode'
import { resolveGoogleMapsLink } from '../google-maps-link'
import { buildMandalEditPatch, buildNewMandalInsert, formatAuditTrail } from '../mandal-approval'
import { paginationRange } from '../mandals-query'
import { uploadSubmissionPhoto } from '../photo-upload'
import { checkRateLimit } from '../rate-limit'
import { moderatorProcedure, publicProcedure, router } from '../trpc'

export const submissionsRouter = router({
  /**
   * Public, rate-limited (design-plan.md Milestone 7). Two-phase: first call
   * (confirm_duplicate: false) may return possible_duplicate without writing
   * anything; the client re-submits with confirm_duplicate: true to force
   * the write through after the submitter reviews the matches.
   */
  create: publicProcedure
    .input(submissionsCreateInputSchema)
    .output(submissionsCreateOutputSchema)
    .mutation(async ({ input }) => {
      // Both keys are checked because neither is sufficient alone: session_id
      // is client-generated (src/lib/session-id.ts) so a determined caller
      // just mints a new one, and the IP is shared by everyone behind a
      // carrier NAT. See ../client-ip.ts for why the IP isn't simply
      // x-forwarded-for's first entry.
      const ip = await clientIp()
      const [sessionAllowed, ipAllowed] = await Promise.all([
        checkRateLimit(`session:${input.session_id}`),
        checkRateLimit(`ip:${ip}`),
      ])
      if (!sessionAllowed || !ipAllowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many submissions from you recently — please try again in a while.',
        })
      }

      // Service-role, not ctx.supabase: `submissions` has no grant for
      // anon/authenticated at all (supabase/migrations/0009_lock_down_privileges.sql).
      // It used to, via the submissions_public_insert RLS policy, which meant
      // anyone with the public anon key could POST rows straight to
      // /rest/v1/submissions — skipping this rate limiter, the Zod input
      // schema, the image validation, and the duplicate check. This procedure
      // is now the only way in.
      const supabase = createSupabaseServiceRoleClient()

      if (input.type === 'edit_mandal') {
        // Existence check rather than trusting the FK constraint to reject a
        // bad id: a friendly BAD_REQUEST beats a raw Postgres FK-violation
        // message reaching the submitter.
        const { data: mandal, error: mandalError } = await supabase
          .from('mandals')
          .select('id')
          .eq('id', input.payload.mandal_id)
          .maybeSingle()

        if (mandalError) {
          throw internalError('submissions.create edit_mandal mandal lookup', mandalError)
        }
        if (!mandal) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'That mandal no longer exists.',
          })
        }

        const { mandal_id, message, photo_data_url, ...changes } = input.payload
        // reporter_message isn't a mandal column — buildMandalEditPatch's
        // whitelist (server/mandal-approval.ts) ignores unknown keys, so it
        // rides along in payload purely for the moderator to read, same as
        // every proposed field change below.
        const payload: Record<string, unknown> = { reporter_message: message }
        for (const [key, value] of Object.entries(changes)) {
          if (value !== undefined) payload[key] = value
        }
        if (photo_data_url) {
          payload.photo_url = await uploadSubmissionPhoto(photo_data_url)
        }

        const submissionId = randomUUID()
        const { error: insertError } = await supabase.from('submissions').insert({
          id: submissionId,
          type: 'edit_mandal',
          mandal_id,
          payload,
          submitter_contact: input.submitter_contact ?? null,
          status: 'pending',
        })

        if (insertError) {
          throw internalError('submissions.create edit_mandal insert', insertError)
        }

        return { status: 'created' as const, submissionId }
      }

      let location: { lat: number; lng: number }
      if (input.payload.location.kind === 'pin') {
        location = { lat: input.payload.location.lat, lng: input.payload.location.lng }
      } else if (input.payload.location.kind === 'google_maps_link') {
        const resolved = await resolveGoogleMapsLink(input.payload.location.url)
        if (!resolved) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              "Couldn't find a location in that link — try dropping a pin on the map instead.",
          })
        }
        location = resolved
      } else {
        const geocoded = await geocodeAddress(input.payload.location.address)
        if (!geocoded) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: "Couldn't find that address — try dropping a pin on the map instead.",
          })
        }
        location = geocoded
      }

      if (!input.confirm_duplicate) {
        // Candidate narrowing happens in SQL now (mandal_duplicate_candidates,
        // supabase/migrations/0010_duplicate_candidates.sql). The previous
        // unfiltered `select * from mandals` was silently capped by
        // config.toml's max_rows = 1000 and, running under the anon client,
        // couldn't see private or flagged mandals at all — so it missed
        // duplicates on both counts. Scoring below is unchanged.
        const { data: candidates, error } = await supabase.rpc('mandal_duplicate_candidates', {
          p_name: input.payload.name,
          p_lat: location.lat,
          p_lng: location.lng,
        })
        if (error) {
          throw internalError('submissions.create duplicate lookup', error)
        }

        const matches = findPossibleDuplicates(
          input.payload.name,
          location,
          (candidates ?? []) as DuplicateCandidate[]
        )
        if (matches.length > 0) {
          return { status: 'possible_duplicate' as const, matches }
        }
      }

      const photoUrl = input.payload.photo_data_url
        ? await uploadSubmissionPhoto(input.payload.photo_data_url)
        : null

      const payload = {
        name: input.payload.name,
        area: input.payload.area,
        lat: location.lat,
        lng: location.lng,
        established_year: input.payload.established_year ?? null,
        timings: input.payload.timings ?? null,
        nearest_station: input.payload.nearest_station ?? null,
        description: input.payload.description ?? null,
        tags: input.payload.tags ?? null,
        official_contact: input.payload.official_contact ?? null,
        is_public: input.payload.is_public,
        photo_url: photoUrl,
      }

      const submissionId = randomUUID()
      const { error: insertError } = await supabase.from('submissions').insert({
        id: submissionId,
        type: 'new_mandal',
        payload,
        submitter_contact: input.submitter_contact ?? null,
        status: 'pending',
      })

      if (insertError) {
        throw internalError('submissions.create insert', insertError)
      }

      return { status: 'created' as const, submissionId }
    }),

  /** Moderator-only queue (design-plan.md Milestone 8). */
  list: moderatorProcedure
    .input(submissionsListInputSchema)
    .output(submissionsListOutputSchema)
    .query(async ({ input }) => {
      const { from, to } = paginationRange(input.page, input.pageSize)

      // Service-role, not ctx.supabase: submissions is service-role-only
      // (supabase/migrations/0009_lock_down_privileges.sql) — the
      // moderatorProcedure check upstream is what authorizes this read.
      const supabase = createSupabaseServiceRoleClient()
      const { data, count, error } = await supabase
        .from('submissions')
        .select('*', { count: 'exact' })
        .eq('status', input.status)
        .order('submitted_at', { ascending: true })
        .range(from, to)

      if (error) {
        throw internalError('submissions.list', error)
      }

      const rows = data ?? []

      // One extra query for the whole page rather than one per row: fetch
      // name/slug for every distinct mandal_id an edit_mandal row on this
      // page targets, then attach it client-side. new_mandal rows (and any
      // edit_mandal row whose target mandal was since deleted) just get null.
      const mandalIds = [...new Set(rows.map((row) => row.mandal_id).filter((id) => id !== null))]
      const mandalById = new Map<string, { name: string; slug: string }>()
      if (mandalIds.length > 0) {
        const { data: mandals, error: mandalsError } = await supabase
          .from('mandals')
          .select('id, name, slug')
          .in('id', mandalIds)

        if (mandalsError) {
          throw internalError('submissions.list mandal join', mandalsError)
        }
        for (const mandal of mandals ?? []) {
          mandalById.set(mandal.id as string, { name: mandal.name, slug: mandal.slug })
        }
      }

      const items = rows.map((row) => ({
        ...row,
        mandal: row.mandal_id ? (mandalById.get(row.mandal_id) ?? null) : null,
      }))

      return { items, total: count ?? 0, page: input.page }
    }),

  /** All ids for a status (design-plan.md Milestone 8 follow-up: bulk review) — powers "select all". */
  listIds: moderatorProcedure
    .input(submissionsListIdsInputSchema)
    .output(submissionsListIdsOutputSchema)
    .query(async ({ input }) => {
      const supabase = createSupabaseServiceRoleClient()
      const { data, error } = await supabase
        .from('submissions')
        .select('id')
        .eq('status', input.status)
        .order('submitted_at', { ascending: true })
        .limit(1000)

      if (error) {
        throw internalError('submissions.listIds', error)
      }

      return { ids: (data ?? []).map((row) => row.id as string) }
    }),

  /**
   * Lets a moderator correct a pending submission's payload before approving
   * it (design-plan.md Milestone 8 follow-up) — e.g. fixing an imprecise
   * pin, filling in zone, or cleaning up a bulk-imported row. Only touches
   * `payload`; approve/reject still go through `review` below, which reads
   * whatever's currently stored — so edits just need to land before that call.
   */
  updatePayload: moderatorProcedure
    .input(submissionsUpdatePayloadInputSchema)
    .output(submissionsUpdatePayloadOutputSchema)
    .mutation(async ({ input }) => {
      const supabase = createSupabaseServiceRoleClient()

      const { data: submission, error: fetchError } = await supabase
        .from('submissions')
        .select('status')
        .eq('id', input.submissionId)
        .maybeSingle()

      if (fetchError) {
        throw internalError('submissions.updatePayload fetch', fetchError)
      }
      if (!submission) {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }
      if (submission.status !== 'pending') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Only pending submissions can be edited.',
        })
      }

      const { error: updateError } = await supabase
        .from('submissions')
        .update({ payload: input.payload })
        .eq('id', input.submissionId)

      if (updateError) {
        throw internalError('submissions.updatePayload update', updateError)
      }

      return { ok: true as const }
    }),

  /**
   * Approve/reject a pending submission (design-plan.md Milestone 8). Approve
   * writes go through a Postgres function (supabase/migrations/0009_lock_down_privileges.sql)
   * so the mandals write and the submissions status update commit atomically —
   * slug generation and edit-patch whitelisting stay in JS (../mandal-approval),
   * only the already-decided row is handed to the function.
   */
  review: moderatorProcedure
    .input(submissionsReviewInputSchema)
    .output(submissionsReviewOutputSchema)
    .mutation(async ({ input }) => {
      const supabase = createSupabaseServiceRoleClient()
      const result = await reviewSubmission(supabase, input)

      // Approved content is now live — refresh the ISR pages that cached its
      // absence (design-plan.md Milestone 8).
      revalidatePath('/')
      if (result.mandalSlug) {
        revalidatePath(`/mandal/${result.mandalSlug}`)
      }

      return result
    }),

  /**
   * Same decision logic as `review`, applied to up to 50 submissions in one
   * call (design-plan.md Milestone 8 follow-up: reviewing a 190-row bulk
   * import one card at a time isn't practical). Each id is independent —
   * one bad row (already reviewed, target mandal deleted, no valid patch
   * fields) is recorded as an error alongside the rest rather than aborting
   * the whole batch, since a moderator selecting 50 rows has no way to know
   * in advance which ones are still clean.
   */
  bulkReview: moderatorProcedure
    .input(submissionsBulkReviewInputSchema)
    .output(submissionsBulkReviewOutputSchema)
    .mutation(async ({ input }) => {
      const supabase = createSupabaseServiceRoleClient()
      const results: SubmissionsBulkReviewOutput['results'] = []
      const approvedSlugs = new Set<string>()

      // Sequential, not Promise.all: these are writes against a shared
      // connection pool (slug-collision reads plus an RPC per row), and
      // running 50 of them concurrently risks exhausting it for every other
      // request in flight. A few extra seconds here is cheaper than that.
      for (const submissionId of input.submissionIds) {
        try {
          const outcome = await reviewSubmission(supabase, {
            submissionId,
            decision: input.decision,
            moderatorNotes: input.moderatorNotes,
          })
          results.push({
            submissionId,
            status: outcome.status,
            mandalSlug: outcome.mandalSlug,
            error: null,
          })
          if (outcome.mandalSlug) {
            approvedSlugs.add(outcome.mandalSlug)
          }
        } catch (err) {
          results.push({
            submissionId,
            status: 'error',
            mandalSlug: null,
            error: err instanceof TRPCError ? err.message : 'Unexpected error',
          })
        }
      }

      if (approvedSlugs.size > 0) {
        revalidatePath('/')
        for (const slug of approvedSlugs) {
          revalidatePath(`/mandal/${slug}`)
        }
      }

      return { results }
    }),
})

/**
 * Shared by `review` and `bulkReview` — fetches the submission, applies the
 * approve/reject decision, and returns the outcome. Throws TRPCError for
 * anything that stops a single submission from being reviewable; callers
 * decide whether that aborts the whole request (review) or is recorded
 * per-item and the batch continues (bulkReview).
 */
async function reviewSubmission(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  input: { submissionId: string; decision: 'approve' | 'reject'; moderatorNotes?: string }
): Promise<{ status: 'approved' | 'rejected'; mandalSlug: string | null }> {
  const { data: submission, error: fetchError } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', input.submissionId)
    .maybeSingle()

  if (fetchError) {
    throw internalError('submissions.review fetch', fetchError)
  }
  if (!submission) {
    throw new TRPCError({ code: 'NOT_FOUND' })
  }
  if (submission.status !== 'pending') {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'This submission was already reviewed.',
    })
  }

  if (input.decision === 'reject') {
    const { error: rejectError } = await supabase
      .from('submissions')
      .update({
        status: 'rejected',
        moderator_notes: input.moderatorNotes ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', input.submissionId)

    if (rejectError) {
      throw internalError('submissions.review reject', rejectError)
    }

    return { status: 'rejected' as const, mandalSlug: null }
  }

  let mandalSlug: string | null

  if (submission.type === 'new_mandal') {
    // Only slugs that could actually collide, rather than every slug in
    // the table: generateSlug only ever compares against `slugify(name)`
    // and suffixed forms of it. The unfiltered read this replaces was
    // capped by config.toml's max_rows = 1000, so past that it could
    // hand generateSlug an incomplete set and mint a slug that then
    // failed the mandals_slug_key unique index.
    const slugPrefix = slugify(submission.payload?.name ?? '')
    const { data: existingRows, error: slugFetchError } = await supabase
      .from('mandals')
      .select('slug')
      .like('slug', `${slugPrefix}%`)

    if (slugFetchError) {
      throw internalError('submissions.review slug lookup', slugFetchError)
    }

    const existingSlugs = new Set((existingRows ?? []).map((row) => row.slug as string))
    const insertRow = buildNewMandalInsert(submission.payload, existingSlugs)

    const { data: slug, error: rpcError } = await supabase.rpc('approve_new_mandal_submission', {
      p_submission_id: input.submissionId,
      p_mandal: insertRow,
      p_moderator_notes: input.moderatorNotes ?? null,
    })

    if (rpcError) {
      throw internalError('submissions.review approve new_mandal', rpcError)
    }
    mandalSlug = slug
  } else {
    if (!submission.mandal_id) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Edit submission is missing its target mandal.',
      })
    }

    const { data: existingMandal, error: mandalFetchError } = await supabase
      .from('mandals')
      .select('*')
      .eq('id', submission.mandal_id)
      .maybeSingle()

    if (mandalFetchError) {
      throw internalError('submissions.review mandal fetch', mandalFetchError)
    }
    if (!existingMandal) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Target mandal no longer exists.' })
    }

    const { patch, dropped } = buildMandalEditPatch(submission.payload)
    if (Object.keys(patch).length === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          dropped.length > 0
            ? `This submission proposes no valid changes (rejected: ${dropped.join(', ')}).`
            : 'This submission proposes no changes.',
      })
    }

    const notes = formatAuditTrail(existingMandal, patch, input.moderatorNotes, dropped)

    const { data: slug, error: rpcError } = await supabase.rpc('approve_edit_mandal_submission', {
      p_submission_id: input.submissionId,
      p_mandal_id: submission.mandal_id,
      p_patch: patch,
      p_moderator_notes: notes,
    })

    if (rpcError) {
      throw internalError('submissions.review approve edit_mandal', rpcError)
    }
    mandalSlug = slug
  }

  return { status: 'approved' as const, mandalSlug }
}
