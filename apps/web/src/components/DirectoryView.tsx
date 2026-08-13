'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc/react'
import {
  filtersFromSearchParams,
  inputFromFilters,
  inputsMatch,
  queryStringFromFilters,
  type Filters,
} from '@/lib/mandal-filters'
import { mandalsListInputSchema, type MandalsListOutput } from '@/shared/schemas'
import { FilterBar } from './FilterBar'
import { MandalCard } from './MandalCard'

const DEBOUNCE_MS = 300
const PAGE_SIZE = 24

// What page.tsx's ISR fetch always uses — the baseline `initialData` is only
// valid to seed react-query's cache when the active filters resolve to this
// exact query too.
const DEFAULT_INPUT = mandalsListInputSchema.parse({})

type DirectoryViewProps = {
  initialData: MandalsListOutput
}

export function DirectoryView({ initialData }: DirectoryViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<Filters>(() => filtersFromSearchParams(searchParams))
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const queryInput = inputFromFilters(filters, PAGE_SIZE)

  // initialData only applies when the active query matches the plain listing
  // page.tsx already fetched via ISR — once filters diverge from that,
  // react-query has no seed for the new key and correctly falls through to a
  // real fetch (placeholderData below covers that loading gap). A shared
  // link that lands with filters already in the URL skips initialData
  // entirely and fetches client-side on mount.
  const { data, error, isFetching } = trpc.mandals.list.useQuery(queryInput, {
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
  const mapQuery = queryStringFromFilters(filters)

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Ganpati mandals</h1>
        <Link
          href={mapQuery ? `/map?${mapQuery}` : '/map'}
          className="text-sm font-medium text-orange-600 hover:underline"
        >
          View on map →
        </Link>
      </div>
      <FilterBar filters={filters} onChange={handleFiltersChange} />

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          Couldn&apos;t load mandals: {error.message}
        </p>
      )}

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
