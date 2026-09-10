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
  const [page, setPage] = useState(1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const queryInput = inputFromFilters(filters, PAGE_SIZE, page)

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
      // Any filter change re-narrows the result set, so page 3 of the old
      // filters is meaningless against the new ones (and would often land
      // past the end, showing an empty grid).
      setPage(1)
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
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const mapQuery = queryStringFromFilters(filters)

  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6"
    >
      <div>
        <span className="text-xs font-bold tracking-widest text-accent-deep uppercase">
          Discover · Plan · Visit
        </span>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
          Find every Ganpati across the Mumbai region.
        </h1>
        <p className="mt-2 max-w-prose text-ink-soft">
          A free, crowd-built map of sarvajanik mandals across Mumbai, Thane, Navi Mumbai and the
          wider MMR.
        </p>
      </div>

      <FilterBar filters={filters} onChange={handleFiltersChange} />

      <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
        <span className="text-sm text-ink-soft">
          <b className="font-bold text-ink">{data?.total ?? 0}</b> mandal
          {data?.total === 1 ? '' : 's'}
        </span>
        <Link
          href={mapQuery ? `/map?${mapQuery}` : '/map'}
          className="text-sm font-semibold text-accent-deep hover:underline"
        >
          View on map →
        </Link>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-crit-tint px-3 py-2 text-sm text-crit">
          Couldn&apos;t load mandals: {error.message}
        </p>
      )}

      {items.length === 0 ? (
        <p role="status" className="py-12 text-center text-ink-faint">
          {isFetching ? 'Loading…' : 'No mandals match these filters yet.'}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((mandal) => (
              <MandalCard key={mandal.id} mandal={mandal} />
            ))}
          </div>

          {totalPages > 1 && (
            <nav
              aria-label="Directory pages"
              className="flex items-center justify-center gap-4 border-t border-line pt-4 text-sm"
            >
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || isFetching}
                className="rounded-md border border-line px-3 py-1.5 font-semibold text-ink-soft hover:border-ink-faint hover:text-ink disabled:opacity-40"
              >
                ← Previous
              </button>
              <span className="text-ink-faint">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || isFetching}
                className="rounded-md border border-line px-3 py-1.5 font-semibold text-ink-soft hover:border-ink-faint hover:text-ink disabled:opacity-40"
              >
                Next →
              </button>
            </nav>
          )}
        </>
      )}
    </main>
  )
}
