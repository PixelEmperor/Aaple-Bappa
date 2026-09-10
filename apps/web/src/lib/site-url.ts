/**
 * The site's own canonical, absolute origin — used for `metadataBase`
 * (resolves relative OG/twitter image URLs and sets the canonical link),
 * `robots.ts`'s sitemap reference, and `sitemap.ts`'s entry URLs. All three
 * need the same answer, so it lives in one place rather than three.
 *
 * Preference order mirrors src/server/same-origin.ts's allowedOrigins():
 * an explicit custom domain first, then whatever Vercel assigned this
 * deployment, then localhost for dev — so this never needs its own env var
 * beyond the one CSRF already relies on.
 */
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
