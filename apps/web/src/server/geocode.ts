import 'server-only'
import { internalError } from './errors'

/**
 * Free-text address geocoding for submissions.create (design-plan.md
 * Milestone 7) — only used when a submitter doesn't drop a map pin. A
 * single ad-hoc call per submission, not the batch pipeline's 1 req/sec
 * throttle (data-pipeline/geocode.py) which is a separate, offline concern.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'AapleBappa-App/1.0 (contact@aaplebappa.in; submission geocoding)'

// See src/server/google-maps-link.ts: fetch() has no default timeout, and a
// submitter's request waits on this one.
const FETCH_TIMEOUT_MS = 5000

export type GeocodeResult = { lat: number; lng: number }

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    q: address,
    format: 'json',
    limit: '1',
    countrycodes: 'in',
  })

  let response: Response
  try {
    response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (error) {
    // Timeout or network failure. Surfaced as "couldn't geocode" rather than
    // a 500: the caller (submissions.create) turns a null into a
    // "try dropping a pin instead" message, which is the useful outcome
    // either way.
    if (error instanceof Error && error.name === 'TimeoutError') return null
    // Anything else went through to the anonymous submitter verbatim before,
    // including getaddrinfo/DNS detail about our own egress. Log it, return
    // the generic message.
    throw internalError(
      'geocodeAddress fetch',
      error instanceof Error ? error : { message: 'unknown' }
    )
  }

  if (!response.ok) {
    // Was `new Error('Nominatim geocoding failed: <status>')`, whose message
    // tRPC passes straight to the client for a non-TRPCError throw.
    throw internalError('geocodeAddress upstream', {
      message: `Nominatim responded ${response.status}`,
    })
  }

  const results = (await response.json()) as Array<{ lat: string; lon: string }>
  const first = results[0]
  if (!first) return null

  return { lat: Number(first.lat), lng: Number(first.lon) }
}
