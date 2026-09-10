import { z } from 'zod'
import { generateSlug } from '@/shared/slug'
import { photoUrlSchema, TAGS, ZONES } from '@/shared/schemas'

/**
 * Approve-time logic for submissions.review (design-plan.md Milestone 8),
 * kept separate from the Supabase/RPC calls so it's unit-testable without a
 * live database.
 */

// Shape submissions.create actually writes into `submissions.payload` for
// type='new_mandal' (see routers/submissions.ts) — already mandal-column-shaped
// (lat/lng resolved, photo uploaded to a URL), not the client-facing
// newMandalPayloadSchema.
/*
 * `.nullish()` throughout the optional half, not `.nullable()`.
 *
 * These payloads aren't all written by submissions.create — the mandal
 * dataset import wrote 190 of them directly — and `.nullable()` demands the
 * key be *present*, so a script that omitted `timings` entirely made the row
 * unapprovable with a ZodError rather than simply having no timings. Every
 * one of these columns is nullable in the table
 * (supabase/migrations/0001_core_schema.sql), so absent and null mean the
 * same thing here and there's nothing to gain by distinguishing them.
 *
 * `is_public` is the exception: the column is `not null default true`, so it
 * gets an explicit default rather than being allowed through as null, which
 * would fail the not-null constraint at insert time.
 */
export const storedNewMandalPayloadSchema = z.object({
  name: z.string(),
  area: z.string(),
  zone: z.enum(ZONES).nullish(),
  lat: z.number(),
  lng: z.number(),
  established_year: z.number().int().nullish(),
  timings: z.string().nullish(),
  nearest_station: z.string().nullish(),
  description: z.string().nullish(),
  tags: z.array(z.enum(TAGS)).nullish(),
  official_contact: z.string().nullish(),
  is_public: z.boolean().default(true),
  photo_url: photoUrlSchema.nullish(),
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

/**
 * Per-column value validation for an edit patch. Whitelisting the column
 * *names* alone (which is all buildMandalEditPatch used to do) leaves the
 * values completely untyped, and these payloads are not trusted input: an
 * edit_mandal row's `payload` is whatever its submitter wrote. So a patch
 * could carry a `photo_url` of `javascript:…`, a megabyte-long `name`, or
 * `tags` outside the TAGS enum, and approving it merged all of that
 * straight into a live public mandal row.
 *
 * Bounds mirror submissionEditablePayloadSchema in shared/schemas.ts.
 */
const editableMandalColumnSchemas = {
  name: z.string().trim().min(2).max(200),
  area: z.string().trim().min(2).max(200),
  zone: z.enum(ZONES).nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  established_year: z.number().int().min(1800).max(new Date().getFullYear()).nullable(),
  description: z.string().trim().max(2000).nullable(),
  history: z.string().trim().max(5000).nullable(),
  nearest_station: z.string().trim().max(200).nullable(),
  tags: z.array(z.enum(TAGS)).max(TAGS.length).nullable(),
  timings: z.string().trim().max(200).nullable(),
  official_contact: z.string().trim().max(200).nullable(),
  photo_url: photoUrlSchema.nullable(),
  is_public: z.boolean(),
} satisfies Record<(typeof EDITABLE_MANDAL_COLUMNS)[number], z.ZodType>

/** Builds the row for approve_new_mandal_submission's `p_mandal` argument. */
export function buildNewMandalInsert(payload: unknown, existingSlugs: ReadonlySet<string>) {
  const parsed = storedNewMandalPayloadSchema.parse(payload)
  return {
    ...parsed,
    slug: generateSlug(parsed.name, parsed.area, existingSlugs),
  }
}

/**
 * Whitelists known mandal columns out of an edit submission's raw payload
 * *and* validates each value against editableMandalColumnSchemas above.
 *
 * A present-but-invalid column is dropped rather than throwing: an edit
 * submission is a bag of independent field suggestions, so one unusable
 * field shouldn't block a moderator from approving the rest. Rejected
 * columns come back in `dropped` so review() can record them in the audit
 * trail instead of losing them silently.
 */
export function buildMandalEditPatch(payload: unknown): {
  patch: Record<string, unknown>
  dropped: string[]
} {
  if (typeof payload !== 'object' || payload === null) return { patch: {}, dropped: [] }

  const source = payload as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  const dropped: string[] = []

  for (const column of EDITABLE_MANDAL_COLUMNS) {
    if (!(column in source)) continue

    const parsed = editableMandalColumnSchemas[column].safeParse(source[column])
    if (parsed.success) {
      patch[column] = parsed.data
    } else {
      dropped.push(column)
    }
  }

  return { patch, dropped }
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
  moderatorNotes?: string,
  droppedColumns: readonly string[] = []
): string {
  // Only the columns the RPC will actually change. Both approve functions
  // write `coalesce(p_patch->>'x', x)`, so a null in the patch is a no-op —
  // recording it as "overwritten" put changes in the audit trail that never
  // happened. `tags` is the one exception: its CASE arm treats an explicit
  // JSON null as "clear the tags", so a null there is a real change.
  const effectiveKeys = Object.keys(patch).filter((key) => patch[key] !== null || key === 'tags')
  const priorValues = Object.fromEntries(effectiveKeys.map((key) => [key, priorMandal[key]]))
  const parts = [`[prior values overwritten: ${JSON.stringify(priorValues)}]`]

  // Columns buildMandalEditPatch refused: recorded rather than dropped
  // quietly, so a moderator can see the submission proposed something the
  // patch schema wouldn't accept.
  if (droppedColumns.length > 0) {
    parts.push(`[rejected as invalid: ${droppedColumns.join(', ')}]`)
  }

  const trail = parts.join(' ')
  return moderatorNotes ? `${moderatorNotes}\n\n${trail}` : trail
}
