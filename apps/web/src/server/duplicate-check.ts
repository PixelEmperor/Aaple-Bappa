import Fuse from 'fuse.js'

/**
 * Live duplicate detection for submissions.create (design-plan.md Milestone 7):
 * fuzzy name match + haversine proximity, run against the anon-visible
 * mandals (RLS restricts this to public/verified rows — a known v1 scope
 * limit, not checking against private/unverified mandals).
 */

// Flag as a duplicate if the name alone is this close to an exact match...
const NAME_SIMILARITY_THRESHOLD = 0.82
// ...or if it's within this radius of an existing mandal AND at least
// loosely similarly named (catches "Lalbaugcha Raja" vs "Lalbaug Raja").
const NEARBY_METERS = 250
const NEARBY_NAME_SIMILARITY_THRESHOLD = 0.5

const EARTH_RADIUS_METERS = 6371000

export type DuplicateCandidate = {
  id: string
  name: string
  slug: string
  area: string
  lat: number
  lng: number
}

export type DuplicateMatch = DuplicateCandidate & {
  nameSimilarity: number
  distanceMeters: number
}

export function haversineDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRadians = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}

export function findPossibleDuplicates(
  name: string,
  location: { lat: number; lng: number },
  candidates: DuplicateCandidate[]
): DuplicateMatch[] {
  if (candidates.length === 0) return []

  // threshold: 1 disables Fuse's own match/no-match cutoff — every candidate
  // gets scored, and this module's own thresholds decide what counts as a
  // duplicate using both name similarity and distance together.
  const fuse = new Fuse(candidates, { keys: ['name'], includeScore: true, threshold: 1 })
  const scoreByCandidateId = new Map(
    fuse.search(name).map((result) => [result.item.id, result.score ?? 1])
  )

  const matches: DuplicateMatch[] = []
  for (const candidate of candidates) {
    const nameSimilarity = 1 - (scoreByCandidateId.get(candidate.id) ?? 1)
    const distanceMeters = haversineDistanceMeters(location, candidate)

    const isDuplicate =
      nameSimilarity >= NAME_SIMILARITY_THRESHOLD ||
      (distanceMeters <= NEARBY_METERS && nameSimilarity >= NEARBY_NAME_SIMILARITY_THRESHOLD)

    if (isDuplicate) {
      matches.push({ ...candidate, nameSimilarity, distanceMeters })
    }
  }

  return matches.sort((a, b) => b.nameSimilarity - a.nameSimilarity)
}
