import { describe, expect, it } from 'vitest'
import {
  filtersFromSearchParams,
  inputFromFilters,
  inputsMatch,
  queryStringFromFilters,
} from './mandal-filters'
import type { MandalsListInput } from '@/shared/schemas'

describe('filtersFromSearchParams', () => {
  it('defaults to empty filters', () => {
    expect(filtersFromSearchParams(new URLSearchParams())).toEqual({
      search: '',
      area: '',
      zone: '',
      tags: [],
    })
  })

  it('reads all params, splitting tags on comma', () => {
    const params = new URLSearchParams(
      'search=Raja&area=Lalbaug&zone=Central+Mumbai&tags=tallest,oldest'
    )
    expect(filtersFromSearchParams(params)).toEqual({
      search: 'Raja',
      area: 'Lalbaug',
      zone: 'Central Mumbai',
      tags: ['tallest', 'oldest'],
    })
  })
})

describe('inputFromFilters', () => {
  it('omits empty fields and applies the given page size', () => {
    expect(inputFromFilters({ search: '', area: '', zone: '', tags: [] }, 300)).toEqual({
      search: undefined,
      area: undefined,
      zone: undefined,
      tags: undefined,
      page: 1,
      pageSize: 300,
    })
  })

  it('drops a zone value that is not a real zone', () => {
    const result = inputFromFilters({ search: '', area: '', zone: 'Not A Zone', tags: [] }, 24)
    expect(result.zone).toBeUndefined()
  })

  it('keeps a valid zone', () => {
    const result = inputFromFilters({ search: '', area: '', zone: 'Central Mumbai', tags: [] }, 24)
    expect(result.zone).toBe('Central Mumbai')
  })

  it('filters out tags that are not real tags', () => {
    const result = inputFromFilters(
      { search: '', area: '', zone: '', tags: ['tallest', 'made-up'] },
      24
    )
    expect(result.tags).toEqual(['tallest'])
  })
})

describe('inputsMatch', () => {
  it('matches identical inputs', () => {
    const a = {
      page: 1,
      pageSize: 24,
      search: undefined,
      area: undefined,
      zone: undefined,
      tags: undefined,
    }
    expect(inputsMatch(a, { ...a })).toBe(true)
  })

  it('does not match different search terms', () => {
    const a = {
      page: 1,
      pageSize: 24,
      search: 'Raja',
      area: undefined,
      zone: undefined,
      tags: undefined,
    }
    const b = { ...a, search: 'Ganraj' }
    expect(inputsMatch(a, b)).toBe(false)
  })

  it('does not match different tags', () => {
    const a: MandalsListInput = {
      page: 1,
      pageSize: 24,
      search: undefined,
      area: undefined,
      zone: undefined,
      tags: ['tallest'],
    }
    const b: MandalsListInput = { ...a, tags: ['oldest'] }
    expect(inputsMatch(a, b)).toBe(false)
  })
})

describe('queryStringFromFilters', () => {
  it('returns an empty string for empty filters', () => {
    expect(queryStringFromFilters({ search: '', area: '', zone: '', tags: [] })).toBe('')
  })

  it('round-trips through filtersFromSearchParams', () => {
    const filters = {
      search: 'Raja',
      area: 'Lalbaug',
      zone: 'Central Mumbai',
      tags: ['tallest', 'oldest'],
    }
    const roundTripped = filtersFromSearchParams(
      new URLSearchParams(queryStringFromFilters(filters))
    )
    expect(roundTripped).toEqual(filters)
  })
})
