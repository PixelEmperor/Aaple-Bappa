import 'server-only'
import { extractLatLngFromGoogleMapsUrl } from '@/shared/google-maps-url'

// Only Google's own domains — this list gates which URLs the server will
// ever fetch. Without it, a submitter could paste an arbitrary URL (e.g.
// pointing at an internal service or cloud metadata endpoint) and this
// server-side fetch would happily request it: a classic SSRF hole, not a
// hypothetical one, so both the initial URL's host and the resolved
// redirect target are checked against this list.
const ALLOWED_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'www.google.com',
  'google.com',
])

// Only these need a network round-trip: short links carry no coordinates
// of their own, just an opaque id that redirects to the canonical URL.
const SHORT_LINK_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl'])

function parseAllowedGoogleUrl(url: string): URL | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (!ALLOWED_HOSTS.has(parsed.hostname)) return null
  return parsed
}

/**
 * Resolves a Google Maps URL (submitted via the "paste a Google Maps link"
 * location mode) to lat/lng. Returns null for anything that isn't a
 * recognizable Google Maps URL with extractable coordinates.
 */
export async function resolveGoogleMapsLink(
  url: string
): Promise<{ lat: number; lng: number } | null> {
  const parsed = parseAllowedGoogleUrl(url)
  if (!parsed) return null

  const direct = extractLatLngFromGoogleMapsUrl(parsed.toString())
  if (direct) return direct

  if (!SHORT_LINK_HOSTS.has(parsed.hostname)) return null

  let response: Response
  try {
    response = await fetch(parsed.toString(), { redirect: 'follow' })
  } catch {
    return null
  }

  // The redirect chain is Google's own to control, but the final hop still
  // gets the same host check before its coordinates are trusted.
  const resolved = parseAllowedGoogleUrl(response.url)
  if (!resolved) return null

  return extractLatLngFromGoogleMapsUrl(resolved.toString())
}
