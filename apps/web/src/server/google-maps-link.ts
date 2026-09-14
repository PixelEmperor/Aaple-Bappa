import 'server-only'
import {
  extractLatLngFromGoogleMapsUrl,
  extractPlaceNameFromGoogleMapsUrl,
} from '@/shared/google-maps-url'
import { geocodeAddress } from './geocode'

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

// Caps how many times resolveViaPlaceName retries Nominatim on one request —
// see that function for why more than one attempt is needed at all. 4 was
// tuned against a 6-segment address (Tardeo, this file's other fixture)
// where the 4th, most-generic attempt succeeded; a real Kalyan report with 8
// segments needed the 6th ("Mumbai, Kalyan, Maharashtra 421201") — the first
// 5, all containing a building/road/plus-code, drew a blank. Confirmed live
// against Nominatim for both addresses.
const MAX_PLACE_NAME_GEOCODE_ATTEMPTS = 8

/**
 * Last resort once no coordinates can be found anywhere in a resolved URL:
 * geocode the place name Google embedded in the path instead of giving up.
 * Confirmed against a real report — a mobile-app share link resolved to
 * .../maps/place/Altamount+Road+Cha+Raja,+Eastman+House,+SK+Barodawala+Marg,+.../data=!4m2!3m1!1s0x...!18m1!1e1
 * with no @lat,lng or !3d!4d anywhere, which extractLatLngFromGoogleMapsUrl
 * has no way to read coordinates out of — there simply aren't any.
 *
 * A single geocode attempt on the full string usually fails outright:
 * Nominatim is OpenStreetMap data, which has essentially no coverage of a
 * small seasonal community mandal or a building name — confirmed live
 * against the address above, which drew a blank. Google's own string is
 * ordered most-specific-first ("<mandal name>, <building>, <street>, <area>,
 * <city>, <state> <pincode>"), so progressively dropping the leading segment
 * and retrying converges on a prefix OSM does recognize — a street or area —
 * same string, verified live: the 4th attempt ("Tardeo, Mumbai, Maharashtra
 * 400026") resolved correctly while the first three didn't. The result is
 * necessarily an approximation (the actual street/area, not the exact
 * building), no worse than a submitter typing a rough address instead of
 * dropping a pin — a moderator can still refine the pin before approving.
 */
async function resolveViaPlaceName(url: string): Promise<{ lat: number; lng: number } | null> {
  const placeName = extractPlaceNameFromGoogleMapsUrl(url)
  if (!placeName) return null

  const segments = placeName
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
  const attempts = Math.min(segments.length, MAX_PLACE_NAME_GEOCODE_ATTEMPTS)

  for (let i = 0; i < attempts; i++) {
    const coords = await geocodeAddress(segments.slice(i).join(', '))
    if (coords) return coords
  }
  return null
}

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

  if (!SHORT_LINK_HOSTS.has(parsed.hostname)) {
    // A full (non-shortened) Google Maps URL with no coordinates anywhere in
    // it — geocode the place name it does carry rather than giving up.
    return resolveViaPlaceName(parsed.toString())
  }

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
      // End of the chain. Coordinates may be in the URL we landed on; if not,
      // fall back to geocoding whatever place name it does carry.
      const coords = extractLatLngFromGoogleMapsUrl(current.toString())
      if (coords) return coords
      return resolveViaPlaceName(current.toString())
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
