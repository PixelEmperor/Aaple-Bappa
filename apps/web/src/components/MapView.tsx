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
    <div className="flex h-full items-center justify-center text-ink-faint">Loading map…</div>
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
    <main id="main-content" className="flex w-full flex-1 flex-col gap-4 p-4">
      <FilterBar filters={filters} onChange={handleFiltersChange} />
      {error && (
        <p role="alert" className="rounded-md bg-crit-tint px-3 py-2 text-sm text-crit">
          Couldn&apos;t load mandals: {error.message}
        </p>
      )}
      {/* An explicit viewport-relative height, not flex-1: body only has
          min-height (not a definite height) up the tree, so a flex-grow
          chain through it resolves to 0 despite min-h-[400px] — confirmed via
          Leaflet's own getSize() reporting {x: 1348, y: 0} with flex-1. */}
      <div className="relative h-[70vh] min-h-[400px] overflow-hidden rounded-lg border border-line shadow-sm">
        <MapCanvas mandals={mandals} />
        {isFetching && (
          <div
            role="status"
            className="absolute top-2 right-2 z-[1000] rounded-md bg-surface/90 px-3 py-1 text-xs font-semibold text-ink-soft shadow-sm"
          >
            Loading…
          </div>
        )}
      </div>
    </main>
  )
}
