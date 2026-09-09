import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { securityHeaders } from './security-headers'

function headerMap() {
  return new Map(securityHeaders().map(({ key, value }) => [key, value]))
}

describe('securityHeaders', () => {
  const originalR2 = process.env.CLOUDFLARE_R2_PUBLIC_URL

  beforeEach(() => {
    process.env.CLOUDFLARE_R2_PUBLIC_URL = 'https://photos.aaplebappa.in'
  })

  afterEach(() => {
    if (originalR2 === undefined) delete process.env.CLOUDFLARE_R2_PUBLIC_URL
    else process.env.CLOUDFLARE_R2_PUBLIC_URL = originalR2
  })

  it('sets every header the app was previously missing', () => {
    expect([...headerMap().keys()]).toEqual([
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Cross-Origin-Opener-Policy',
    ])
  })

  it('denies framing two ways, for clickjacking', () => {
    expect(headerMap().get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
    expect(headerMap().get('X-Frame-Options')).toBe('DENY')
  })

  it('blocks plugin and base-tag injection', () => {
    const csp = headerMap().get('Content-Security-Policy')!
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
  })

  it('allows the R2 photo origin as an image source', () => {
    expect(headerMap().get('Content-Security-Policy')).toContain('https://photos.aaplebappa.in')
  })

  it('omits the R2 origin rather than emitting an empty token when unset', () => {
    delete process.env.CLOUDFLARE_R2_PUBLIC_URL
    const imgSrc = headerMap()
      .get('Content-Security-Policy')!
      .split('; ')
      .find((directive) => directive.startsWith('img-src'))!
    expect(imgSrc).not.toMatch(/\s{2}/)
    expect(imgSrc.trim()).toBe(imgSrc)
  })

  it('survives a malformed R2 URL without emitting a broken directive', () => {
    process.env.CLOUDFLARE_R2_PUBLIC_URL = 'not a url'
    expect(() => securityHeaders()).not.toThrow()
    expect(headerMap().get('Content-Security-Policy')).toContain("img-src 'self' data: blob:")
  })

  it('keeps connect-src to a known allowlist so injected script can’t exfiltrate freely', () => {
    const csp = headerMap().get('Content-Security-Policy')!
    const sources = csp
      .split('; ')
      .find((directive) => directive.startsWith('connect-src'))!
      .split(' ')
      .slice(1)

    // Per-vendor subdomain wildcards are fine and necessary (Supabase gives
    // each project its own subdomain, PostHog and Sentry each their own
    // ingest host). What must not appear is a source that matches any host:
    // a bare `*`, or a scheme-only source like `https:`.
    expect(sources).not.toContain('*')
    expect(sources.filter((source) => /^https?:$/.test(source))).toEqual([])
    for (const source of sources) {
      expect(source === "'self'" || /^https:\/\/(\*\.)?[a-z0-9.-]+$/.test(source)).toBe(true)
    }
    expect(sources).toContain('https://*.supabase.co')
  })

  it('sets an HSTS max-age long enough for the preload list', () => {
    const hsts = headerMap().get('Strict-Transport-Security')!
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)![1])
    // The preload list requires at least one year.
    expect(maxAge).toBeGreaterThanOrEqual(31536000)
    expect(hsts).toContain('includeSubDomains')
  })

  describe('script-src and NODE_ENV', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('allows unsafe-eval outside production, for React Refresh/Turbopack HMR', () => {
      vi.stubEnv('NODE_ENV', 'development')
      const scriptSrc = headerMap()
        .get('Content-Security-Policy')!
        .split('; ')
        .find((directive) => directive.startsWith('script-src'))!
      expect(scriptSrc).toContain("'unsafe-eval'")
    })

    it('omits unsafe-eval in production, since React never calls eval() there', () => {
      vi.stubEnv('NODE_ENV', 'production')
      const scriptSrc = headerMap()
        .get('Content-Security-Policy')!
        .split('; ')
        .find((directive) => directive.startsWith('script-src'))!
      expect(scriptSrc).not.toContain('unsafe-eval')
    })
  })
})
