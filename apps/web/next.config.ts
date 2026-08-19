import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {/* config options here */}

// Source-map upload (design-plan.md Milestone 10) only activates once
// SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN are set — without them this
// wrapper still runs but the upload step no-ops, so it's safe to leave in
// place across environments that haven't configured Sentry yet.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
})
