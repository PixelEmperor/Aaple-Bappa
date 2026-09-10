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

// A submitter's request is blocked on this fetch, and fetch() has no default
// timeout — so without a deadline a slow or hanging upstream holds a
// serverless invocation open until the platform kills it, which is a cheap
// way to exhaust concurrency. Short-link expansion is a single redirect
// lookup; if it hasn't answered in 5s it isn't going to.
const FETCH_TIMEOUT_MS = 5000

// Redirects are followed one hop at a time so every intermediate Location can
// be re-checked against ALLOWED_HOSTS. `redirect: 'follow'` checked only the
// *final* URL, which meant the fetches in between were made to whatever the
// chain pointed at — a shortener whose target is attacker-chosen is enough to
// get this server to issue requests at `169.254.169.254` or a localhost port,
// and only the last hop's failure was ever noticed. A short link needs one
// hop, maybe two; three is slack, not a budget to spend.
const MAX_REDIRECTS = 3

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

  let current = parsed

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response
    try {
      response = await fetch(current.toString(), {
        // Manual, so this loop — not undici — decides whether the next hop is
        // a host we're willing to connect to.
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    } catch {
      return null
    }

    const location = response.headers.get('location')
    if (!location) {
      // End of the chain. Coordinates may be in the URL we landed on.
      return extractLatLngFromGoogleMapsUrl(current.toString())
    }

    // Relative Locations are legal, so resolve against the current URL before
    // validating — and validate before the next iteration fetches it.
    let next: URL
    try {
      next = new URL(location, current)
    } catch {
      return null
    }

    const allowedNext = parseAllowedGoogleUrl(next.toString())
    if (!allowedNext) return null

    const direct = extractLatLngFromGoogleMapsUrl(allowedNext.toString())
    if (direct) return direct

    current = allowedNext
  }

  return null
}
