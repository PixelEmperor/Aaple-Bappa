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

  it('builds eq filters for area and zone', () => {
    expect(buildMandalFilters(input({ area: 'Lalbaug', zone: 'Central Mumbai' }))).toEqual([
      { type: 'eq', column: 'area', value: 'Lalbaug' },
      { type: 'eq', column: 'zone', value: 'Central Mumbai' },
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
