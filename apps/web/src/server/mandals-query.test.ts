import { describe, expect, it } from 'vitest'
import { buildMandalFilters, paginationRange } from './mandals-query'
import { mandalsListInputSchema } from '@/shared/schemas'

function input(overrides: Partial<Parameters<typeof mandalsListInputSchema.parse>[0]> = {}) {
  return mandalsListInputSchema.parse({ ...overrides })
}

describe('paginationRange', () => {
  it('computes the first page', () => {
    expect(paginationRange(1, 24)).toEqual({ from: 0, to: 23 })
  })

  it('computes a later page', () => {
    expect(paginationRange(3, 24)).toEqual({ from: 48, to: 71 })
  })

  it('respects a non-default page size', () => {
    expect(paginationRange(2, 10)).toEqual({ from: 10, to: 19 })
  })
})

describe('buildMandalFilters', () => {
  it('returns no filters for an empty input', () => {
    expect(buildMandalFilters(input())).toEqual([])
  })

  it('builds an ilike filter for search, wrapped for partial matching', () => {
    expect(buildMandalFilters(input({ search: 'Raja' }))).toEqual([
      { type: 'ilike', column: 'name', value: '%Raja%' },
    ])
  })

  /**
   * Interpolated raw, a search of `%` produced the pattern `%%%` — every row,
   * returned as though it were a filtered result — and `_` matched any single
   * character. A searched wildcard should match itself.
   */
  it('escapes LIKE wildcards so a search term matches literally', () => {
    expect(buildMandalFilters(input({ search: '%' }))).toEqual([
      { type: 'ilike', column: 'name', value: '%\\%%' },
    ])
    expect(buildMandalFilters(input({ search: 'a_b' }))).toEqual([
      { type: 'ilike', column: 'name', value: '%a\\_b%' },
    ])
  })

  it('escapes backslashes before the wildcards it adds', () => {
    expect(buildMandalFilters(input({ search: 'a\\%b' }))).toEqual([
      { type: 'ilike', column: 'name', value: '%a\\\\\\%b%' },
    ])
  })

  it('builds a partial, case-insensitive filter for area, and an exact one for zone', () => {
    // area is free text styled as a search box (FilterBar.tsx) — an exact
    // match meant typing "andheri" against a row whose area is "Andheri
    // West" returned nothing. zone is a fixed dropdown (ZONES), so exact
    // stays correct there.
    expect(buildMandalFilters(input({ area: 'Lalbaug', zone: 'Central Mumbai' }))).toEqual([
      { type: 'ilike', column: 'area', value: '%Lalbaug%' },
      { type: 'eq', column: 'zone', value: 'Central Mumbai' },
    ])
  })

  it('escapes LIKE wildcards in the area filter too', () => {
    expect(buildMandalFilters(input({ area: 'a_b' }))).toEqual([
      { type: 'ilike', column: 'area', value: '%a\\_b%' },
    ])
  })

  it('builds a contains filter for tags', () => {
    expect(buildMandalFilters(input({ tags: ['tallest', 'oldest'] }))).toEqual([
      { type: 'contains', column: 'tags', value: ['tallest', 'oldest'] },
    ])
  })

  it('omits a tags filter for an empty tags array', () => {
    expect(buildMandalFilters(input({ tags: [] }))).toEqual([])
  })

  it('combines all filters when all inputs are present', () => {
    expect(
      buildMandalFilters(
        input({ search: 'Raja', area: 'Lalbaug', zone: 'Central Mumbai', tags: ['tallest'] })
      )
    ).toHaveLength(4)
  })
})
