import { z } from 'zod'
import { generateSlug } from '@/shared/slug'
import { TAGS } from '@/shared/schemas'

/**
 * Approve-time logic for submissions.review (design-plan.md Milestone 8),
 * kept separate from the Supabase/RPC calls so it's unit-testable without a
 * live database.
 */

// Shape submissions.create actually writes into `submissions.payload` for
// type='new_mandal' (see routers/submissions.ts) — already mandal-column-shaped
// (lat/lng resolved, photo uploaded to a URL), not the client-facing
// newMandalPayloadSchema.
export const storedNewMandalPayloadSchema = z.object({
  name: z.string(),
  area: z.string(),
  lat: z.number(),
  lng: z.number(),
  established_year: z.number().int().nullable(),
  timings: z.string().nullable(),
  nearest_station: z.string().nullable(),
  description: z.string().nullable(),
  tags: z.array(z.enum(TAGS)).nullable(),
  official_contact: z.string().nullable(),
  is_public: z.boolean(),
  photo_url: z.string().nullable(),
})

export type StoredNewMandalPayload = z.infer<typeof storedNewMandalPayloadSchema>

// Columns an edit_mandal submission may patch. Mirrored in
// supabase/migrations/0006_submission_review.sql's approve_edit_mandal_submission.
export const EDITABLE_MANDAL_COLUMNS = [
  'name',
  'area',
  'zone',
  'lat',
  'lng',
  'established_year',
  'description',
  'history',
  'nearest_station',
  'tags',
  'timings',
  'official_contact',
  'photo_url',
  'is_public',
] as const

/** Builds the row for approve_new_mandal_submission's `p_mandal` argument. */
export function buildNewMandalInsert(payload: unknown, existingSlugs: ReadonlySet<string>) {
  const parsed = storedNewMandalPayloadSchema.parse(payload)
  return {
    ...parsed,
    slug: generateSlug(parsed.name, parsed.area, existingSlugs),
  }
}

/** Whitelists known mandal columns out of an edit submission's raw payload. */
export function buildMandalEditPatch(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) return {}

  const patch: Record<string, unknown> = {}
  for (const column of EDITABLE_MANDAL_COLUMNS) {
    if (column in payload) {
      patch[column] = (payload as Record<string, unknown>)[column]
    }
  }
  return patch
}

/**
 * Concurrent-edit audit trail (scope §6.5): when an edit submission
 * overwrites a mandal, record what the overwritten fields used to hold
 * alongside the moderator's own notes, so last-approved-wins is reviewable
 * later.
 */
export function formatAuditTrail(
  priorMandal: Record<string, unknown>,
  patch: Record<string, unknown>,
  moderatorNotes?: string
): string {
  const priorValues = Object.fromEntries(Object.keys(patch).map((key) => [key, priorMandal[key]]))
  const trail = `[prior values overwritten: ${JSON.stringify(priorValues)}]`
  return moderatorNotes ? `${moderatorNotes}\n\n${trail}` : trail
}
