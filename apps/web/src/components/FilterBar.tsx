'use client'

import type { Filters } from '@/lib/mandal-filters'
import { TAGS, ZONES } from '@/shared/schemas'

export type { Filters }

type FilterBarProps = {
  filters: Filters
  onChange: (filters: Filters) => void
}

/**
 * Zone and tags are real dropdowns/toggles because scope.md fixes both
 * lists upfront. Area stays free text: it's open-ended data we can't
 * enumerate until Milestone 2 seeds real mandals (an `areas.list`
 * procedure could turn this into a proper dropdown once that data exists).
 */
export function FilterBar({ filters, onChange }: FilterBarProps) {
  function toggleTag(tag: string) {
    const tags = filters.tags.includes(tag)
      ? filters.tags.filter((t) => t !== tag)
      : [...filters.tags, tag]
    onChange({ ...filters, tags })
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
      <label className="flex-1 sm:min-w-48">
        <span className="sr-only">Search mandals by name</span>
        <input
          type="search"
          placeholder="Search by name…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label>
        <span className="sr-only">Filter by area</span>
        <input
          type="text"
          placeholder="Area…"
          value={filters.area}
          onChange={(e) => onChange({ ...filters, area: e.target.value })}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label>
        <span className="sr-only">Filter by zone</span>
        <select
          value={filters.zone}
          onChange={(e) => onChange({ ...filters, zone: e.target.value })}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">All zones</option>
          {ZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by tag">
        {TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={filters.tags.includes(tag)}
            onClick={() => toggleTag(tag)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filters.tags.includes(tag)
                ? 'border-orange-600 bg-orange-600 text-white'
                : 'border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  )
}
