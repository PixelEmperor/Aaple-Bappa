import * as Sentry from '@sentry/nextjs'

/**
 * Client-side error monitoring (design-plan.md Milestone 10). Deliberately
 * no session replay or user feedback widget: this app collects location
 * pins, photos, and free-text submissions, and replay would capture that on
 * screen — the same "no PII" bar scope.md sets for PostHog applies here.
 * A missing DSN disables the SDK outright rather than throwing, matching
 * how the rest of this app degrades when third-party config is absent
 * (see lib/env.ts's requireEnv, used only for genuinely required config).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
