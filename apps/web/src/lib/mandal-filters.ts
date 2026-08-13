import { TAGS, ZONES, type MandalsListInput } from '@/shared/schemas'

/**
 * Directory/map filter state <-> URL/query-input conversions, shared between
 * DirectoryView and MapView (design-plan.md Milestone 5: "Read filter state
 * from same URL params as directory").
 */

export type Filters = {
  search: string
  area: string
  zone: string
  tags: string[]
}

export function filtersFromSearchParams(params: URLSearchParams): Filters {
  return {
    search: params.get('search') ?? '',
    area: params.get('area') ?? '',
    zone: params.get('zone') ?? '',
    tags: params.get('tags')?.split(',').filter(Boolean) ?? [],
  }
}

export function inputFromFilters(filters: Filters, pageSize: number): MandalsListInput {
  const zone = (ZONES as readonly string[]).includes(filters.zone)
    ? (filters.zone as MandalsListInput['zone'])
    : undefined
  const tags = filters.tags.filter((tag): tag is (typeof TAGS)[number] =>
    (TAGS as readonly string[]).includes(tag)
  )

  return {
    search: filters.search || undefined,
    area: filters.area || undefined,
    zone,
    tags: tags.length > 0 ? tags : undefined,
    page: 1,
    pageSize,
  }
}

/** Whether `a` and `b` would produce the same mandals.list query. */
export function inputsMatch(a: MandalsListInput, b: MandalsListInput): boolean {
  return (
    a.search === b.search &&
    a.area === b.area &&
    a.zone === b.zone &&
    a.page === b.page &&
    a.pageSize === b.pageSize &&
    (a.tags ?? []).join(',') === (b.tags ?? []).join(',')
  )
}

export function queryStringFromFilters(filters: Filters): string {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.area) params.set('area', filters.area)
  if (filters.zone) params.set('zone', filters.zone)
  if (filters.tags.length > 0) params.set('tags', filters.tags.join(','))
  return params.toString()
}
