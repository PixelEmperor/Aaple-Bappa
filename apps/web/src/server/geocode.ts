import 'server-only'

/**
 * Free-text address geocoding for submissions.create (design-plan.md
 * Milestone 7) — only used when a submitter doesn't drop a map pin. A
 * single ad-hoc call per submission, not the batch pipeline's 1 req/sec
 * throttle (data-pipeline/geocode.py) which is a separate, offline concern.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'AapleBappa-App/1.0 (contact@aaplebappa.in; submission geocoding)'

export type GeocodeResult = { lat: number; lng: number }

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    q: address,
    format: 'json',
    limit: '1',
    countrycodes: 'in',
  })

  const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    throw new Error(`Nominatim geocoding failed: ${response.status}`)
  }

  const results = (await response.json()) as Array<{ lat: string; lon: string }>
  const first = results[0]
  if (!first) return null

  return { lat: Number(first.lat), lng: Number(first.lon) }
}
