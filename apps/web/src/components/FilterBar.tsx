'use client'

import type { Filters } from '@/lib/mandal-filters'
import { TAGS, ZONES } from '@/shared/schemas'

export type { Filters }

type FilterBarProps = {
  filters: Filters
  onChange: (filters: Filters) => void
}

const fieldClass =
  'rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:ring-3 focus:ring-accent-tint focus:outline-none'

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
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <label className="flex-1 sm:min-w-48">
          <span className="sr-only">Search mandals by name</span>
          <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1 shadow-sm focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-tint">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="flex-none text-ink-faint"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search “Lalbaugcha Raja”…"
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              className="w-full border-none bg-transparent py-1.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>
        </label>

        <label>
          <span className="sr-only">Filter by area</span>
          <input
            type="text"
            placeholder="Area…"
            value={filters.area}
            onChange={(e) => onChange({ ...filters, area: e.target.value })}
            className={fieldClass}
          />
        </label>

        <label>
          <span className="sr-only">Filter by zone</span>
          <select
            value={filters.zone}
            onChange={(e) => onChange({ ...filters, zone: e.target.value })}
            className={fieldClass}
          >
            <option value="">All zones</option>
            {ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by tag">
        {TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={filters.tags.includes(tag)}
            onClick={() => toggleTag(tag)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
              filters.tags.includes(tag)
                ? 'border-accent bg-accent text-white'
                : 'border-line text-ink-soft hover:border-ink-faint hover:text-ink'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  )
}
