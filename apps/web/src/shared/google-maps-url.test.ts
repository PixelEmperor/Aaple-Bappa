import { describe, expect, it } from 'vitest'
import { extractLatLngFromGoogleMapsUrl } from './google-maps-url'

describe('extractLatLngFromGoogleMapsUrl', () => {
  it('extracts coordinates from a place-page !3d!4d pattern', () => {
    const url =
      'https://www.google.com/maps/place/Lalbaugcha+Raja/@18.9998,72.8332,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d18.9967!4d72.8332'
    expect(extractLatLngFromGoogleMapsUrl(url)).toEqual({ lat: 18.9967, lng: 72.8332 })
  })

  it('prefers the !3d!4d place coordinates over the @lat,lng viewport center', () => {
    const url = 'https://www.google.com/maps/@19.0,73.0,15z/data=!3d18.5!4d72.5'
    expect(extractLatLngFromGoogleMapsUrl(url)).toEqual({ lat: 18.5, lng: 72.5 })
  })

  it('extracts coordinates from an @lat,lng viewport pattern', () => {
    expect(
      extractLatLngFromGoogleMapsUrl('https://www.google.com/maps/@19.076,72.8777,15z')
    ).toEqual({
      lat: 19.076,
      lng: 72.8777,
    })
  })

  it('extracts coordinates from a q= query param', () => {
    expect(extractLatLngFromGoogleMapsUrl('https://maps.google.com/?q=19.076,72.8777')).toEqual({
      lat: 19.076,
      lng: 72.8777,
    })
  })

  it('extracts coordinates from an ll= query param', () => {
    expect(
      extractLatLngFromGoogleMapsUrl('https://maps.google.com/maps?ll=19.076,72.8777&z=15')
    ).toEqual({ lat: 19.076, lng: 72.8777 })
  })

  it('handles negative coordinates', () => {
    expect(
      extractLatLngFromGoogleMapsUrl('https://www.google.com/maps/@-33.87,151.21,12z')
    ).toEqual({
      lat: -33.87,
      lng: 151.21,
    })
  })

  it('returns null for a URL with no coordinates (e.g. an unresolved short link)', () => {
    expect(extractLatLngFromGoogleMapsUrl('https://maps.app.goo.gl/abCD1234')).toBeNull()
  })

  it('returns null for out-of-range values that merely look like coordinates', () => {
    expect(extractLatLngFromGoogleMapsUrl('https://example.com/@999.0,999.0,15z')).toBeNull()
  })

  it('returns null for a non-Maps URL', () => {
    expect(extractLatLngFromGoogleMapsUrl('https://example.com/not-a-maps-link')).toBeNull()
  })
})
