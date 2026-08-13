'use client'

import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  filtersFromSearchParams,
  inputFromFilters,
  queryStringFromFilters,
  type Filters,
} from '@/lib/mandal-filters'
import { trpc } from '@/lib/trpc/react'
import { FilterBar } from './FilterBar'

const DEBOUNCE_MS = 300
// scope.md §11's non-functional target: smooth pan/zoom with 300+ pins.
const MAP_PAGE_SIZE = 300

// Leaflet touches `window` at module load time, which crashes during Next's
// server render of a Client Component — ssr: false is load-bearing here,
// not a style preference (design-plan.md Milestone 5).
const MapCanvas = dynamic(() => import('./MapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-zinc-500">Loading map…</div>
  ),
})

export function MapView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<Filters>(() => filtersFromSearchParams(searchParams))
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const { data, error, isFetching } = trpc.mandals.list.useQuery(
    inputFromFilters(filters, MAP_PAGE_SIZE),
    {
      placeholderData: (previous) => previous,
    }
  )

  const handleFiltersChange = useCallback(
    (next: Filters) => {
      setFilters(next)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const query = queryStringFromFilters(next)
        router.replace(query ? `/map?${query}` : '/map', { scroll: false })
      }, DEBOUNCE_MS)
    },
    [router]
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const mandals = data?.items ?? []

  return (
    <div className="flex w-full flex-1 flex-col gap-4 p-4">
      <FilterBar filters={filters} onChange={handleFiltersChange} />
      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          Couldn&apos;t load mandals: {error.message}
        </p>
      )}
      {/* An explicit viewport-relative height, not flex-1: body only has
          min-height (not a definite height) up the tree, so a flex-grow
          chain through it resolves to 0 despite min-h-[400px] — confirmed via
          Leaflet's own getSize() reporting {x: 1348, y: 0} with flex-1. */}
      <div className="relative h-[70vh] min-h-[400px] overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <MapCanvas mandals={mandals} />
        {isFetching && (
          <div
            role="status"
            className="absolute top-2 right-2 z-[1000] rounded-md bg-white/90 px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm dark:bg-zinc-900/90 dark:text-zinc-400"
          >
            Loading…
          </div>
        )}
      </div>
    </div>
  )
}
