import type { MandalsListInput } from '@/shared/schemas'

/**
 * Pure filter/pagination logic for `mandals.list`, kept separate from the
 * Supabase query builder so it's unit-testable without a live database
 * (design-plan.md Milestone 3 explicitly calls for this as a unit test).
 */

export function paginationRange(page: number, pageSize: number): { from: number; to: number } {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  return { from, to }
}

export type MandalFilter =
  | { type: 'ilike'; column: 'name'; value: string }
  | { type: 'eq'; column: 'area' | 'zone'; value: string }
  | { type: 'contains'; column: 'tags'; value: string[] }

export function buildMandalFilters(input: MandalsListInput): MandalFilter[] {
  const filters: MandalFilter[] = []

  if (input.search) {
    filters.push({ type: 'ilike', column: 'name', value: `%${input.search}%` })
  }
  if (input.area) {
    filters.push({ type: 'eq', column: 'area', value: input.area })
  }
  if (input.zone) {
    filters.push({ type: 'eq', column: 'zone', value: input.zone })
  }
  if (input.tags && input.tags.length > 0) {
    filters.push({ type: 'contains', column: 'tags', value: input.tags })
  }

  return filters
}
