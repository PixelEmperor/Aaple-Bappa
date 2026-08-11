'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc/react'
import {
  TAGS,
  ZONES,
  mandalsListInputSchema,
  type MandalsListInput,
  type MandalsListOutput,
} from '@/shared/schemas'
import { FilterBar, type Filters } from './FilterBar'
import { MandalCard } from './MandalCard'

const DEBOUNCE_MS = 300

// What page.tsx's ISR fetch always uses — the baseline `initialData` is only
// valid to seed react-query's cache when the active filters resolve to this
// exact query too.
const DEFAULT_INPUT = mandalsListInputSchema.parse({})

function filtersFromSearchParams(params: URLSearchParams): Filters {
  return {
    search: params.get('search') ?? '',
    area: params.get('area') ?? '',
    zone: params.get('zone') ?? '',
    tags: params.get('tags')?.split(',').filter(Boolean) ?? [],
  }
}

function inputFromFilters(filters: Filters): MandalsListInput {
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
    pageSize: 24,
  }
}

/** Whether `a` and `b` would produce the same mandals.list query. */
function inputsMatch(a: MandalsListInput, b: MandalsListInput): boolean {
  return (
    a.search === b.search &&
    a.area === b.area &&
    a.zone === b.zone &&
    a.page === b.page &&
    a.pageSize === b.pageSize &&
    (a.tags ?? []).join(',') === (b.tags ?? []).join(',')
  )
}

function queryStringFromFilters(filters: Filters): string {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.area) params.set('area', filters.area)
  if (filters.zone) params.set('zone', filters.zone)
  if (filters.tags.length > 0) params.set('tags', filters.tags.join(','))
  return params.toString()
}

type DirectoryViewProps = {
  initialData: MandalsListOutput
}

export function DirectoryView({ initialData }: DirectoryViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<Filters>(() => filtersFromSearchParams(searchParams))
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const queryInput = inputFromFilters(filters)

  // initialData only applies when the active query matches the plain listing
  // page.tsx already fetched via ISR — once filters diverge from that,
  // react-query has no seed for the new key and correctly falls through to a
  // real fetch (placeholderData below covers that loading gap). A shared
  // link that lands with filters already in the URL skips initialData
  // entirely and fetches client-side on mount.
  const { data, isFetching } = trpc.mandals.list.useQuery(queryInput, {
    initialData: inputsMatch(queryInput, DEFAULT_INPUT) ? initialData : undefined,
    placeholderData: (previous) => previous,
  })

  const handleFiltersChange = useCallback(
    (next: Filters) => {
      setFilters(next)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const query = queryStringFromFilters(next)
        router.replace(query ? `/?${query}` : '/', { scroll: false })
      }, DEBOUNCE_MS)
    },
    [router]
  )

  useEffect(() => {
    // Reads debounceRef.current live at unmount time, not whatever it was
    // when this effect ran — a local const here would capture a stale value.
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const items = data?.items ?? []

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold">Ganpati mandals</h1>
      <FilterBar filters={filters} onChange={handleFiltersChange} />

      {items.length === 0 ? (
        <p role="status" className="py-12 text-center text-zinc-500 dark:text-zinc-400">
          {isFetching ? 'Loading…' : 'No mandals match these filters yet.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((mandal) => (
            <MandalCard key={mandal.id} mandal={mandal} />
          ))}
        </div>
      )}
    </main>
  )
}
