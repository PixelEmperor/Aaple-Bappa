import { TRPCError } from '@trpc/server'
import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role'
import {
  submissionsCreateInputSchema,
  submissionsCreateOutputSchema,
  submissionsListInputSchema,
  submissionsListOutputSchema,
  submissionsReviewInputSchema,
  submissionsReviewOutputSchema,
} from '@/shared/schemas'
import { findPossibleDuplicates } from '../duplicate-check'
import { geocodeAddress } from '../geocode'
import { resolveGoogleMapsLink } from '../google-maps-link'
import { buildMandalEditPatch, buildNewMandalInsert, formatAuditTrail } from '../mandal-approval'
import { paginationRange } from '../mandals-query'
import { uploadSubmissionPhoto } from '../photo-upload'
import { checkRateLimit } from '../rate-limit'
import { moderatorProcedure, publicProcedure, router } from '../trpc'

async function clientIp(): Promise<string> {
  const headerList = await headers()
  const forwardedFor = headerList.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return headerList.get('x-real-ip') ?? 'unknown'
}

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
    .mutation(async ({ ctx, input }) => {
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
        // RLS restricts this to public/verified mandals (mandals_public_read,
        // supabase/migrations/0003_rls.sql) — a known v1 limit, see
        // src/server/duplicate-check.ts.
        const { data: candidates, error } = await ctx.supabase
          .from('mandals')
          .select('id, name, slug, area, lat, lng')
        if (error) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
        }

        const matches = findPossibleDuplicates(input.payload.name, location, candidates ?? [])
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

      // Explicit id, not .select() after insert: anon has no SELECT policy
      // on submissions (submissions_public_insert is insert-only,
      // supabase/migrations/0003_rls.sql), so reading the row back would
      // silently return nothing under RLS.
      const submissionId = randomUUID()
      const { error: insertError } = await ctx.supabase.from('submissions').insert({
        id: submissionId,
        type: 'new_mandal',
        payload,
        submitter_contact: input.submitter_contact ?? null,
        status: 'pending',
      })

      if (insertError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: insertError.message })
      }

      return { status: 'created' as const, submissionId }
    }),

  /** Moderator-only queue (design-plan.md Milestone 8). */
  list: moderatorProcedure
    .input(submissionsListInputSchema)
    .output(submissionsListOutputSchema)
    .query(async ({ input }) => {
      const { from, to } = paginationRange(input.page, input.pageSize)

      // Service-role, not ctx.supabase: submissions has no select policy for
      // anon/authenticated (submissions_public_insert is insert-only,
      // supabase/migrations/0003_rls.sql) — the moderatorProcedure check
      // upstream is what authorizes this read, not RLS.
      const supabase = createSupabaseServiceRoleClient()
      const { data, count, error } = await supabase
        .from('submissions')
        .select('*', { count: 'exact' })
        .eq('status', input.status)
        .order('submitted_at', { ascending: true })
        .range(from, to)

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return { items: data ?? [], total: count ?? 0, page: input.page }
    }),

  /**
   * Approve/reject a pending submission (design-plan.md Milestone 8). Approve
   * writes go through a Postgres function (supabase/migrations/0006_submission_review.sql)
   * so the mandals write and the submissions status update commit atomically —
   * slug generation and edit-patch whitelisting stay in JS (../mandal-approval),
   * only the already-decided row is handed to the function.
   */
  review: moderatorProcedure
    .input(submissionsReviewInputSchema)
    .output(submissionsReviewOutputSchema)
    .mutation(async ({ input }) => {
      const supabase = createSupabaseServiceRoleClient()

      const { data: submission, error: fetchError } = await supabase
        .from('submissions')
        .select('*')
        .eq('id', input.submissionId)
        .maybeSingle()

      if (fetchError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fetchError.message })
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
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: rejectError.message })
        }

        return { status: 'rejected' as const, mandalSlug: null }
      }

      let mandalSlug: string | null

      if (submission.type === 'new_mandal') {
        const { data: existingRows, error: slugFetchError } = await supabase
          .from('mandals')
          .select('slug')

        if (slugFetchError) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: slugFetchError.message })
        }

        const existingSlugs = new Set((existingRows ?? []).map((row) => row.slug as string))
        const insertRow = buildNewMandalInsert(submission.payload, existingSlugs)

        const { data: slug, error: rpcError } = await supabase.rpc(
          'approve_new_mandal_submission',
          {
            p_submission_id: input.submissionId,
            p_mandal: insertRow,
            p_moderator_notes: input.moderatorNotes ?? null,
          }
        )

        if (rpcError) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: rpcError.message })
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
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: mandalFetchError.message })
        }
        if (!existingMandal) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Target mandal no longer exists.' })
        }

        const patch = buildMandalEditPatch(submission.payload)
        const notes = formatAuditTrail(existingMandal, patch, input.moderatorNotes)

        const { data: slug, error: rpcError } = await supabase.rpc(
          'approve_edit_mandal_submission',
          {
            p_submission_id: input.submissionId,
            p_mandal_id: submission.mandal_id,
            p_patch: patch,
            p_moderator_notes: notes,
          }
        )

        if (rpcError) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: rpcError.message })
        }
        mandalSlug = slug
      }

      // Approved content is now live — refresh the ISR pages that cached its
      // absence (design-plan.md Milestone 8).
      revalidatePath('/')
      if (mandalSlug) {
        revalidatePath(`/mandal/${mandalSlug}`)
      }

      return { status: 'approved' as const, mandalSlug }
    }),
})
