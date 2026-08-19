import * as Sentry from '@sentry/nextjs'

/** Server-side error monitoring (design-plan.md Milestone 10) — see instrumentation-client.ts. */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
})
