import { z } from 'zod'

/**
 * Shared Zod schemas + inferred types (design-plan.md Milestone 3),
 * imported by both the tRPC server and client code. Field names mirror
 * the `mandals` table columns (supabase/migrations/0001_core_schema.sql)
 * 1:1 rather than introducing a camelCase mapping layer neither the schema
 * nor design-plan.md asked for.
 */

export const ZONES = [
  'South Mumbai',
  'Central Mumbai',
  'Western Suburbs',
  'Eastern Suburbs',
  'Navi Mumbai',
  'Thane',
  'Kalyan-Dombivli',
  'Mira-Bhayandar',
  'Vasai-Virar',
  'Bhiwandi',
  'Ulhasnagar-Ambernath-Badlapur',
  'Panvel-Uran',
  'Other (MMR)',
] as const

export const TAGS = ['eco-friendly', 'tallest', 'oldest', 'richest', 'family-friendly'] as const

/**
 * Photo size cap (scope.md §7/§8). Lives here rather than in
 * server/image-validation.ts because both sides need it: the byte check
 * after base64-decoding, and the data-URL length bound below that rejects
 * oversized payloads before they're decoded at all.
 */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

// Base64 encodes 3 bytes as 4 characters; the slack covers the
// `data:image/webp;base64,` prefix and any padding.
const BASE64_CHARS_PER_BYTE = 4 / 3
const DATA_URL_PREFIX_SLACK = 64
export const MAX_IMAGE_DATA_URL_LENGTH =
  Math.ceil(MAX_IMAGE_BYTES * BASE64_CHARS_PER_BYTE) + DATA_URL_PREFIX_SLACK

export const mandalSourceSchema = z.enum(['seed', 'crowdsourced', 'official'])
export const verificationStatusSchema = z.enum(['unverified', 'verified', 'flagged'])

/**
 * A stored photo URL. Anywhere a photo_url can be *written* has to go
 * through this rather than a bare z.string(): these values end up in `src`
 * attributes and OpenGraph tags, and `javascript:`/`data:` URLs in that
 * position are the classic stored-XSS payload. Restricting to https also
 * rules out mixed-content warnings on the detail page.
 *
 * Not applied to reads (mandalSchema.photo_url stays a plain string) —
 * tightening that would make a single bad legacy row fail the whole
 * `mandals.list` output parse and blank the directory.
 */
export const photoUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:'
    } catch {
      return false
    }
  }, 'Photo URL must be an absolute https URL')

export const mandalSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  area: z.string(),
  zone: z.enum(ZONES).nullable(),
  lat: z.number(),
  lng: z.number(),
  established_year: z.number().int().nullable(),
  description: z.string().nullable(),
  history: z.string().nullable(),
  nearest_station: z.string().nullable(),
  tags: z.array(z.enum(TAGS)).nullable(),
  timings: z.string().nullable(),
  official_contact: z.string().nullable(),
  photo_url: z.string().nullable(),
  is_public: z.boolean(),
  source: mandalSourceSchema,
  verification_status: verificationStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
})

export type Mandal = z.infer<typeof mandalSchema>

export const mandalsListInputSchema = z.object({
  // Bounded like every other free-text input: an unbounded string here goes
  // straight into an `ilike` pattern, so the cap is what stops a caller
  // handing Postgres a megabyte-long pattern to scan against every row.
  search: z.string().trim().min(1).max(200).optional(),
  area: z.string().trim().max(200).optional(),
  zone: z.enum(ZONES).optional(),
  tags: z.array(z.enum(TAGS)).optional(),
  page: z.number().int().min(1).default(1),
  // Capped at 500, not 100: scope.md §6.2's non-functional target is smooth
  // pan/zoom with 300+ pins loaded on the map view in one request (design-plan.md
  // Milestone 5), so the cap needs headroom above that, not just the
  // directory's 24-per-page default.
  pageSize: z.number().int().min(1).max(500).default(24),
})

export type MandalsListInput = z.infer<typeof mandalsListInputSchema>

export const mandalsListOutputSchema = z.object({
  items: z.array(mandalSchema),
  total: z.number().int(),
  page: z.number().int(),
})

export type MandalsListOutput = z.infer<typeof mandalsListOutputSchema>

export const mandalsGetBySlugInputSchema = z.object({
  slug: z.string().trim().min(1).max(200),
})

/**
 * Submission schemas (design-plan.md Milestone 7). Only `new_mandal` has a
 * built submission form so far — `edit_mandal` exists in the DB schema
 * (supabase/migrations/0001_core_schema.sql) for a future milestone.
 */

// Map-pin drop is preferred; free-text address is a fallback the server
// geocodes (src/server/geocode.ts) — scope.md §6.4. google_maps_link is a
// second fallback: the server extracts lat/lng straight out of the URL
// (src/server/google-maps-link.ts) — no Google API key, no cost.
export const submissionLocationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('pin'),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  z.object({ kind: z.literal('address'), address: z.string().trim().min(3).max(300) }),
  z.object({ kind: z.literal('google_maps_link'), url: z.string().trim().min(1).max(500) }),
])

export type SubmissionLocation = z.infer<typeof submissionLocationSchema>

export const newMandalPayloadSchema = z.object({
  name: z.string().trim().min(2).max(200),
  area: z.string().trim().min(2).max(200),
  location: submissionLocationSchema,
  established_year: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  timings: z.string().trim().max(200).optional(),
  nearest_station: z.string().trim().max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  tags: z.array(z.enum(TAGS)).optional(),
  official_contact: z.string().trim().max(200).optional(),
  is_public: z.boolean().default(true),
  // A compressed (client-side, browser canvas) image as a data: URL — the
  // server re-validates type/size from the actual bytes regardless
  // (src/server/image-validation.ts), never trusting this alone.
  //
  // The length cap matters independently of the MAX_IMAGE_BYTES check, which
  // can only run *after* Buffer.from(..., 'base64') has already materialized
  // the decoded image in memory — so anything that could never pass
  // validation is rejected here, before it's decoded. Vercel's own 4.5MB
  // request-body limit would also catch this in production, but the bound
  // belongs in the contract, not the platform.
  photo_data_url: z.string().max(MAX_IMAGE_DATA_URL_LENGTH).optional(),
})

export type NewMandalPayload = z.infer<typeof newMandalPayloadSchema>

/**
 * Public "report an issue / suggest an edit" payload — one free-text
 * `message` (always shown to the moderator, whatever else is filled in)
 * plus an optional proposed correction per field. Only fields the reporter
 * actually typed something into are sent (see EditMandalForm), so this
 * schema doesn't distinguish "no opinion" from "leave unchanged" — that's
 * handled client-side by omitting the key entirely.
 *
 * Deliberately narrower than a moderator's edit surface: no lat/lng or
 * photo_url here (those need a map pin / upload, not a text field) and no
 * `history` (a longer rewrite belongs with a moderator, not a drive-by
 * report). Whatever is proposed still only ever lands on the mandal via
 * buildMandalEditPatch's own whitelist + validation at approval time.
 */
export const editMandalPayloadSchema = z.object({
  mandal_id: z.uuid(),
  message: z.string().trim().min(3).max(1000),
  name: z.string().trim().min(2).max(200).optional(),
  area: z.string().trim().min(2).max(200).optional(),
  zone: z.enum(ZONES).optional(),
  established_year: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  timings: z.string().trim().max(200).optional(),
  nearest_station: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  official_contact: z.string().trim().max(200).optional(),
  is_public: z.boolean().optional(),
})

export type EditMandalPayload = z.infer<typeof editMandalPayloadSchema>

export const submissionsCreateInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('new_mandal'),
    payload: newMandalPayloadSchema,
    submitter_contact: z.string().trim().max(200).optional(),
    // Set after a possible_duplicate response, once the submitter confirms
    // "this isn't a duplicate" — re-running the same call with this true
    // skips the duplicate check and writes straight through.
    confirm_duplicate: z.boolean().default(false),
    // Anonymous, client-generated (src/lib/session-id.ts), for rate-limiting
    // only — same pattern as crowd_reports.reporter_session_id (scope.md §4).
    session_id: z.uuid(),
  }),
  z.object({
    type: z.literal('edit_mandal'),
    payload: editMandalPayloadSchema,
    submitter_contact: z.string().trim().max(200).optional(),
    session_id: z.uuid(),
  }),
])

export type SubmissionsCreateInput = z.infer<typeof submissionsCreateInputSchema>

const duplicateMatchSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  area: z.string(),
  lat: z.number(),
  lng: z.number(),
  nameSimilarity: z.number(),
  distanceMeters: z.number(),
})

export const submissionsCreateOutputSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('possible_duplicate'), matches: z.array(duplicateMatchSchema) }),
  z.object({ status: z.literal('created'), submissionId: z.uuid() }),
])

export type SubmissionsCreateOutput = z.infer<typeof submissionsCreateOutputSchema>

/**
 * Moderator-facing schemas (design-plan.md Milestone 8). `payload` stays a
 * loose record here — `new_mandal` submissions store a mandal-shaped object
 * written by submissions.create (see server/mandal-approval.ts for the typed
 * view of that shape), while `edit_mandal` has no producer yet and merges
 * whatever keys are present into the target mandal.
 */

export const submissionStatusSchema = z.enum(['pending', 'approved', 'rejected'])
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>

export const submissionSchema = z.object({
  id: z.uuid(),
  type: z.enum(['new_mandal', 'edit_mandal']),
  payload: z.record(z.string(), z.unknown()),
  mandal_id: z.uuid().nullable(),
  submitter_contact: z.string().nullable(),
  status: submissionStatusSchema,
  moderator_notes: z.string().nullable(),
  submitted_at: z.string(),
  reviewed_at: z.string().nullable(),
  // Populated by submissions.list for edit_mandal rows only (a join the DB
  // row itself doesn't carry) so the queue can show which live mandal a
  // report targets, and link to it, without a second round trip per card.
  mandal: z.object({ name: z.string(), slug: z.string() }).nullable(),
})

export type Submission = z.infer<typeof submissionSchema>

export const submissionsListInputSchema = z.object({
  status: submissionStatusSchema.default('pending'),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})

export type SubmissionsListInput = z.infer<typeof submissionsListInputSchema>

export const submissionsListOutputSchema = z.object({
  items: z.array(submissionSchema),
  total: z.number().int(),
  page: z.number().int(),
})

export type SubmissionsListOutput = z.infer<typeof submissionsListOutputSchema>

export const submissionsReviewInputSchema = z.object({
  submissionId: z.uuid(),
  decision: z.enum(['approve', 'reject']),
  moderatorNotes: z.string().trim().max(1000).optional(),
})

export type SubmissionsReviewInput = z.infer<typeof submissionsReviewInputSchema>

export const submissionsReviewOutputSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  mandalSlug: z.string().nullable(),
})

export type SubmissionsReviewOutput = z.infer<typeof submissionsReviewOutputSchema>

/**
 * Bulk approve/reject (design-plan.md Milestone 8 follow-up: the 190-row
 * mandal-dataset import made one-at-a-time review impractical). Capped at
 * 50 per call — each item is its own sequential RPC round trip
 * server-side, and a much larger batch risks the request outrunning a
 * serverless function's execution time limit. The client chunks a larger
 * selection into calls of this size (ModerationQueue.tsx).
 */
export const submissionsBulkReviewInputSchema = z.object({
  submissionIds: z.array(z.uuid()).min(1).max(50),
  decision: z.enum(['approve', 'reject']),
  moderatorNotes: z.string().trim().max(1000).optional(),
})

export type SubmissionsBulkReviewInput = z.infer<typeof submissionsBulkReviewInputSchema>

export const submissionsBulkReviewOutputSchema = z.object({
  results: z.array(
    z.object({
      submissionId: z.uuid(),
      status: z.enum(['approved', 'rejected', 'error']),
      mandalSlug: z.string().nullable(),
      error: z.string().nullable(),
    })
  ),
})

export type SubmissionsBulkReviewOutput = z.infer<typeof submissionsBulkReviewOutputSchema>

/** All ids for a status, for "select all" — capped well above any status's current row count. */
export const submissionsListIdsInputSchema = z.object({
  status: submissionStatusSchema.default('pending'),
})

export type SubmissionsListIdsInput = z.infer<typeof submissionsListIdsInputSchema>

export const submissionsListIdsOutputSchema = z.object({ ids: z.array(z.uuid()) })

export type SubmissionsListIdsOutput = z.infer<typeof submissionsListIdsOutputSchema>

/**
 * A moderator's editable view of a pending new_mandal submission's payload
 * (design-plan.md Milestone 8 follow-up: "edit before approving"). Mirrors
 * server/mandal-approval.ts's storedNewMandalPayloadSchema field-for-field
 * (that one stays server-only since it's also used to parse trusted DB
 * data) — this is the client-facing counterpart, validating moderator input
 * instead.
 */
export const submissionEditablePayloadSchema = z.object({
  name: z.string().trim().min(2).max(200),
  area: z.string().trim().min(2).max(200),
  zone: z.enum(ZONES).nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  established_year: z.number().int().min(1800).max(new Date().getFullYear()).nullable(),
  timings: z.string().trim().max(200).nullable(),
  nearest_station: z.string().trim().max(200).nullable(),
  description: z.string().trim().max(2000).nullable(),
  tags: z.array(z.enum(TAGS)).nullable(),
  official_contact: z.string().trim().max(200).nullable(),
  is_public: z.boolean(),
  photo_url: photoUrlSchema.nullable(),
})

export type SubmissionEditablePayload = z.infer<typeof submissionEditablePayloadSchema>

export const submissionsUpdatePayloadInputSchema = z.object({
  submissionId: z.uuid(),
  payload: submissionEditablePayloadSchema,
})

export type SubmissionsUpdatePayloadInput = z.infer<typeof submissionsUpdatePayloadInputSchema>

export const submissionsUpdatePayloadOutputSchema = z.object({ ok: z.literal(true) })

/** Static reference content (design-plan.md Milestone 9). */

export const helplineCategorySchema = z.enum(['police', 'medical', 'traffic', 'bmc_control_room'])
export type HelplineCategory = z.infer<typeof helplineCategorySchema>

export const helplineSchema = z.object({
  id: z.uuid(),
  category: helplineCategorySchema,
  area: z.string().nullable(),
  phone: z.string(),
  notes: z.string().nullable(),
})

export type Helpline = z.infer<typeof helplineSchema>

export const helplinesListInputSchema = z.object({
  area: z.string().trim().max(200).optional(),
})

export type HelplinesListInput = z.infer<typeof helplinesListInputSchema>

export const helplinesListOutputSchema = z.array(helplineSchema)

export type HelplinesListOutput = z.infer<typeof helplinesListOutputSchema>
