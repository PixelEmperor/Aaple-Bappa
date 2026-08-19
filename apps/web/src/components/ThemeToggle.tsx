'use client'

import { useEffect, useState } from 'react'
import { currentTheme, setTheme, type Theme } from '@/lib/theme'

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme | null>(null)

  useEffect(() => {
    // Reads DOM/matchMedia state that isn't knowable during SSR (a lazy
    // useState initializer would run on the server too and throw) — a
    // one-time reveal after mount, not state synced from a changing
    // external store, so the usual "don't setState in an effect" concern
    // doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(currentTheme())
  }, [])

  function toggle() {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="Toggle theme"
      aria-label="Toggle light and dark theme"
      // Rendered identically on server and first client paint (theme is
      // unknown until mount) — suppressHydrationWarning covers the icon
      // swap that follows once `theme` resolves, avoiding a hydration
      // mismatch warning for a difference that's intentional, not a bug.
      suppressHydrationWarning
      className="grid size-9 flex-none place-items-center rounded-lg border border-line bg-surface text-ink-soft hover:border-ink-faint hover:text-ink"
    >
      {theme === 'dark' ? (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="12" cy="12" r="4.5" />
          <path
            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  )
}
