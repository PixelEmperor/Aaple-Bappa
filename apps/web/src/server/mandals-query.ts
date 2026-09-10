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
  | { type: 'ilike'; column: 'name' | 'area'; value: string }
  | { type: 'eq'; column: 'zone'; value: string }
  | { type: 'contains'; column: 'tags'; value: string[] }

/**
 * Escapes the LIKE metacharacters so a search term matches itself literally.
 *
 * Interpolated raw, a search of `%` became the pattern `%%%` — matching every
 * row while reporting itself as a filtered result — and `_` silently matched
 * any single character. Neither breaks out of the filter (postgrest-js
 * percent-encodes the value, so `,` and `)` can't start a new condition), but
 * "search for a literal underscore" should not be a wildcard.
 *
 * Backslash first, otherwise it would double-escape the escapes added after.
 */
function escapeLikePattern(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/[%_]/g, (char) => `\\${char}`)
}

export function buildMandalFilters(input: MandalsListInput): MandalFilter[] {
  const filters: MandalFilter[] = []

  if (input.search) {
    filters.push({ type: 'ilike', column: 'name', value: `%${escapeLikePattern(input.search)}%` })
  }
  if (input.area) {
    // Was an exact `eq` match against a free-text field the UI presents as a
    // search box (FilterBar.tsx's own comment even calls it "free text") —
    // typing "andheri" against a row whose area is "Andheri West" returned
    // zero matches, since neither the case nor the substring matched
    // exactly. `ilike` makes it behave like the name search it's styled as.
    filters.push({ type: 'ilike', column: 'area', value: `%${escapeLikePattern(input.area)}%` })
  }
  if (input.zone) {
    filters.push({ type: 'eq', column: 'zone', value: input.zone })
  }
  if (input.tags && input.tags.length > 0) {
    filters.push({ type: 'contains', column: 'tags', value: input.tags })
  }

  return filters
}
