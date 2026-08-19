'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { posthog } from '@/lib/posthog'

/**
 * Manual pageview tracking (design-plan.md Milestone 10): capture_pageview
 * is off in lib/posthog.ts's init because a client-side App Router
 * navigation doesn't reload the page for PostHog's own listener to catch —
 * this effect re-fires on every pathname/query change instead.
 */
export function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!posthog.__loaded) return

    const query = searchParams.toString()
    posthog.capture('$pageview', {
      $current_url: query ? `${pathname}?${query}` : pathname,
    })
  }, [pathname, searchParams])

  return null
}
