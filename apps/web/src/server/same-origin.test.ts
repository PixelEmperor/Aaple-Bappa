import { describe, expect, it } from 'vitest'
import { allowedOrigins, isRequestOriginAllowed } from './same-origin'

const ORIGINS = ['https://aaplebappa.in', 'https://web-abc123.vercel.app']

describe('isRequestOriginAllowed', () => {
  it('allows a mutation from the site’s own origin', () => {
    expect(isRequestOriginAllowed('https://aaplebappa.in', 'POST', ORIGINS)).toBe(true)
  })

  it('allows a preview deployment’s own origin', () => {
    expect(isRequestOriginAllowed('https://web-abc123.vercel.app', 'POST', ORIGINS)).toBe(true)
  })

  /**
   * The case this whole check exists for: a signed-in moderator visiting a
   * hostile page, whose script POSTs submissions.review with their session
   * cookie attached. `content-type: text/plain` makes it a CORS "simple
   * request" — no preflight — and tRPC's fetch adapter parses the body
   * regardless of the declared type.
   */
  it('blocks a mutation from an unrelated origin', () => {
    expect(isRequestOriginAllowed('https://evil.example', 'POST', ORIGINS)).toBe(false)
  })

  it('blocks a look-alike origin that merely contains the real host', () => {
    expect(isRequestOriginAllowed('https://aaplebappa.in.evil.example', 'POST', ORIGINS)).toBe(
      false
    )
    expect(isRequestOriginAllowed('https://evil.example/aaplebappa.in', 'POST', ORIGINS)).toBe(
      false
    )
  })

  it('matches on host, so the same host over http still passes', () => {
    // Deliberate, and asserted so it stays deliberate: HSTS plus
    // upgrade-insecure-requests (src/lib/security-headers.ts) mean a browser
    // never sends an http origin for this host in the first place, and
    // comparing full origins instead would break local dev over http.
    expect(isRequestOriginAllowed('http://aaplebappa.in', 'POST', ORIGINS)).toBe(true)
  })

  it('blocks a malformed Origin header', () => {
    expect(isRequestOriginAllowed('not-a-url', 'POST', ORIGINS)).toBe(false)
    expect(isRequestOriginAllowed('null', 'POST', ORIGINS)).toBe(false)
  })

  it('allows an Origin-less GET but not an Origin-less mutation', () => {
    // No Origin means a non-browser caller. Queries are read-only, so they
    // pass; a mutation without one is refused rather than trusted.
    expect(isRequestOriginAllowed(null, 'GET', ORIGINS)).toBe(true)
    expect(isRequestOriginAllowed(null, 'POST', ORIGINS)).toBe(false)
  })

  it('blocks everything when no origin is configured', () => {
    expect(isRequestOriginAllowed('https://aaplebappa.in', 'POST', [])).toBe(false)
  })
})

describe('allowedOrigins', () => {
  it('includes localhost off-platform so local dev works unconfigured', () => {
    expect(allowedOrigins({})).toEqual(['http://localhost:3000'])
  })

  it('drops localhost on Vercel and derives the platform origins', () => {
    const origins = allowedOrigins({
      VERCEL: '1',
      VERCEL_URL: 'web-abc123.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'web.vercel.app',
    })

    expect(origins).toEqual(['https://web.vercel.app', 'https://web-abc123.vercel.app'])
  })

  it('includes the custom domain from NEXT_PUBLIC_SITE_URL', () => {
    // The one that matters behind Cloudflare: the browser's Origin is the
    // custom domain, which neither VERCEL_* var knows about.
    const origins = allowedOrigins({
      VERCEL: '1',
      NEXT_PUBLIC_SITE_URL: 'https://aaplebappa.in',
      VERCEL_URL: 'web-abc123.vercel.app',
    })

    expect(origins).toContain('https://aaplebappa.in')
  })
})
