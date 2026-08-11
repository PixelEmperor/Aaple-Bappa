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

export const mandalSourceSchema = z.enum(['seed', 'crowdsourced', 'official'])
export const verificationStatusSchema = z.enum(['unverified', 'verified', 'flagged'])

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
  search: z.string().trim().min(1).optional(),
  area: z.string().optional(),
  zone: z.enum(ZONES).optional(),
  tags: z.array(z.enum(TAGS)).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(24),
})

export type MandalsListInput = z.infer<typeof mandalsListInputSchema>

export const mandalsListOutputSchema = z.object({
  items: z.array(mandalSchema),
  total: z.number().int(),
  page: z.number().int(),
})

export type MandalsListOutput = z.infer<typeof mandalsListOutputSchema>

export const mandalsGetBySlugInputSchema = z.object({
  slug: z.string().min(1),
})
