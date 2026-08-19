import posthog from 'posthog-js'

/**
 * Privacy-respecting PostHog init (design-plan.md Milestone 10, scope.md's
 * "no PII" bar): autocapture and session recording are both off, since
 * either could incidentally capture submission form content (names,
 * addresses, contact info). Pageviews are captured manually instead
 * (PostHogPageView, below) — the standard pattern for the App Router,
 * where a client-side route change doesn't reload the page PostHog would
 * otherwise auto-track.
 */
export function initPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key || posthog.__loaded) return

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
    person_profiles: 'identified_only',
  })
}

export { posthog }
