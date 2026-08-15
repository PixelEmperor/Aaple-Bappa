import { TRPCError } from '@trpc/server'
import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { submissionsCreateInputSchema, submissionsCreateOutputSchema } from '@/shared/schemas'
import { findPossibleDuplicates } from '../duplicate-check'
import { geocodeAddress } from '../geocode'
import { uploadSubmissionPhoto } from '../photo-upload'
import { checkRateLimit } from '../rate-limit'
import { publicProcedure, router } from '../trpc'

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
})
