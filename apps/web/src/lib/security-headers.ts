/**
 * Response security headers (next.config.ts).
 *
 * The config previously set none at all, so every one of these was absent in
 * production.
 */

const OSM_TILES = 'https://*.tile.openstreetmap.org'
const POSTHOG = 'https://*.posthog.com https://*.i.posthog.com'
const SENTRY = 'https://*.ingest.sentry.io https://*.ingest.de.sentry.io'
const SUPABASE = 'https://*.supabase.co'

function r2Host(): string {
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL
  if (!publicUrl) return ''
  try {
    return new URL(publicUrl).origin
  } catch {
    return ''
  }
}

/**
 * A note on `script-src 'unsafe-inline'`, since it's the one directive here
 * that isn't as tight as it should be.
 *
 * The App Router streams RSC payloads as inline `<script>self.__next_f.push(...)</script>`
 * tags whose content differs per page, so they can't be covered by a hash.
 * The alternative is a per-request nonce injected from proxy.ts — but reading
 * a request header to generate one opts every route into dynamic rendering,
 * which would defeat the ISR the directory and detail pages are built around
 * (docs/design-plan.md Milestone 4/6). So this trades the script-src half of
 * the CSP for ISR, deliberately.
 *
 * What's left still does real work: object-src/base-uri close off plugin and
 * base-tag injection, frame-ancestors stops clickjacking, and the
 * connect-src/img-src allowlists mean an injected script can't exfiltrate to
 * an arbitrary host. And the app's own XSS surface is small — React escapes
 * by default, the single dangerouslySetInnerHTML (src/app/layout.tsx) is a
 * static string from src/lib/theme.ts with no user input, and photo URLs are
 * constrained to https by photoUrlSchema. Revisit if Next.js ships
 * static-compatible nonces.
 */
function contentSecurityPolicy(): string {
  const imgSources = ["'self'", 'data:', 'blob:', OSM_TILES, r2Host()].filter(Boolean).join(' ')

  // Next's dev-mode React Refresh/Turbopack HMR genuinely needs eval() to
  // reconstruct call stacks (hence the exact console error this guards
  // against) — production never calls eval() at all, so this only ever
  // loosens the policy in an environment that isn't internet-facing.
  const scriptSrc =
    process.env.NODE_ENV === 'production'
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'"

  return [
    "default-src 'self'",
    scriptSrc,
    // Tailwind and Leaflet both inject style attributes/elements at runtime.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSources}`,
    // next/font self-hosts Geist, so no external font origin is needed.
    "font-src 'self'",
    `connect-src 'self' ${SUPABASE} ${POSTHOG} ${SENTRY}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

export function securityHeaders(): { key: string; value: string }[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
    // 2 years + preload, matching the HSTS preload list's requirements.
    {
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    },
    // Blocks MIME sniffing — relevant because R2 serves user-uploaded photos.
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Redundant with frame-ancestors above, kept for older browsers.
    { key: 'X-Frame-Options', value: 'DENY' },
    // Don't leak the full path of a mandal page to OSM tile servers or
    // outbound links.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // The submit form needs geolocation for "use my location"; nothing here
    // needs a camera, mic, or payment API.
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)',
    },
    // Isolates this origin from cross-origin window handles.
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ]
}
