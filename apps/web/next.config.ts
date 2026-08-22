import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

// next/image only fetches from allow-listed remote hosts — the R2 public
// bucket domain (CLOUDFLARE_R2_PUBLIC_URL) has to be one of them. Derived
// from the env var rather than hardcoded since that URL is per-environment
// (a custom domain in production, the r2.dev subdomain in dev/staging).
function r2ImageRemotePatterns(): NonNullable<NonNullable<NextConfig['images']>['remotePatterns']> {
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL
  if (!publicUrl) return []

  try {
    const { protocol, hostname } = new URL(publicUrl)
    return [{ protocol: protocol === 'http:' ? 'http' : 'https', hostname }]
  } catch {
    return []
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: r2ImageRemotePatterns(),
  },
}

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
