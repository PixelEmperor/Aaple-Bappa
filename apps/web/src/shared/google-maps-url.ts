/**
 * Extracts lat/lng from a Google Maps URL (Milestone 7 follow-up: "paste a
 * Google Maps link" as a third location-input mode alongside pin-drop and
 * free-text address). Pure regex matching against the URL string itself —
 * no Google API involved, keeping the zero-cost-infra bar (scope.md §1)
 * intact. Short links (maps.app.goo.gl) carry no coordinates in the URL
 * itself and need a server-side redirect resolution first — see
 * server/google-maps-link.ts, which calls this on the resolved URL.
 */
export function extractLatLngFromGoogleMapsUrl(url: string): { lat: number; lng: number } | null {
  // Place pages often carry the pinned place's actual coordinates in
  // `!3d<lat>!4d<lng>` — the `@lat,lng` in the same URL is frequently just
  // the map viewport's center, which can drift from the pin itself.
  const place = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (place) return toCoords(place[1], place[2])

  // Viewport-center pattern: .../@19.076,72.8777,15z...
  const viewport = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (viewport) return toCoords(viewport[1], viewport[2])

  // Query-param pattern: ?q=19.076,72.8777 or &ll=19.076,72.8777
  const query = url.match(/[?&](?:q|ll|query)=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (query) return toCoords(query[1], query[2])

  return null
}

function toCoords(latStr: string, lngStr: string): { lat: number; lng: number } | null {
  const lat = Number(latStr)
  const lng = Number(lngStr)
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}
