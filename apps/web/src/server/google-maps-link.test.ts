import { afterEach, describe, expect, it, vi } from 'vitest'
import { geocodeAddress } from './geocode'
import { resolveGoogleMapsLink } from './google-maps-link'

vi.mock('./geocode', () => ({
  geocodeAddress: vi.fn(),
}))

const geocodeAddressMock = vi.mocked(geocodeAddress)

/**
 * Redirects are followed manually (one fetch per hop, each Location
 * re-validated before it's requested), so the fakes here model the
 * `Location` header rather than the `response.url` that `redirect: 'follow'`
 * used to hand back.
 */
function redirectTo(location: string) {
  return { status: 302, headers: new Headers({ location }) }
}

function finalResponse() {
  return { status: 200, headers: new Headers() }
}

describe('resolveGoogleMapsLink', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    geocodeAddressMock.mockReset()
  })

  it('resolves a full google.com/maps URL without any network call', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await resolveGoogleMapsLink('https://www.google.com/maps/@19.076,72.8777,15z')

    expect(result).toEqual({ lat: 19.076, lng: 72.8777 })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('follows a maps.app.goo.gl short link and extracts coordinates from the resolved URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(redirectTo('https://www.google.com/maps/@19.076,72.8777,15z'))
    )

    const result = await resolveGoogleMapsLink('https://maps.app.goo.gl/abCD1234')

    expect(result).toEqual({ lat: 19.076, lng: 72.8777 })
  })

  it('rejects a short link that redirects somewhere other than a Google domain', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(redirectTo('https://evil.example/@19.076,72.8777,15z'))
    )

    expect(await resolveGoogleMapsLink('https://maps.app.goo.gl/abCD1234')).toBeNull()
  })

  /**
   * The SSRF case that `redirect: 'follow'` allowed: only the *final* URL was
   * host-checked, so every hop in between was fetched first. A shortener
   * pointing at cloud metadata or a localhost port got the request issued and
   * only then rejected. Asserting the call count is the actual regression
   * test — returning null was already true before the fix.
   */
  it('never issues a request to a non-Google redirect target', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(redirectTo('http://169.254.169.254/latest/meta-data/'))
    vi.stubGlobal('fetch', fetchSpy)

    expect(await resolveGoogleMapsLink('https://maps.app.goo.gl/abCD1234')).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('https://maps.app.goo.gl/abCD1234')
  })

  it('gives up rather than following an unbounded redirect chain', async () => {
    // Every hop stays on an allowed host, so only the hop cap stops this.
    const fetchSpy = vi.fn().mockResolvedValue(redirectTo('https://maps.app.goo.gl/next'))
    vi.stubGlobal('fetch', fetchSpy)

    expect(await resolveGoogleMapsLink('https://maps.app.goo.gl/abCD1234')).toBeNull()
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(4)
  })

  it('resolves a relative Location against the current URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(redirectTo('/maps/@19.076,72.8777,15z'))
        .mockResolvedValueOnce(finalResponse())
    )

    // Relative to maps.app.goo.gl, which is itself an allowed host.
    expect(await resolveGoogleMapsLink('https://maps.app.goo.gl/abCD1234')).toEqual({
      lat: 19.076,
      lng: 72.8777,
    })
  })

  it('returns null when the chain ends with no coordinates anywhere', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(finalResponse()))

    expect(await resolveGoogleMapsLink('https://maps.app.goo.gl/abCD1234')).toBeNull()
  })

  it('rejects a non-Google host outright, without ever calling fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    expect(await resolveGoogleMapsLink('https://evil.example/@19.076,72.8777,15z')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects a non-https URL outright', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    expect(await resolveGoogleMapsLink('http://maps.app.goo.gl/abCD1234')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns null when the fetch itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    expect(await resolveGoogleMapsLink('https://maps.app.goo.gl/abCD1234')).toBeNull()
  })

  it('returns null for an unparseable URL', async () => {
    expect(await resolveGoogleMapsLink('not a url')).toBeNull()
  })

  /**
   * The real report this fallback exists for: a mobile-app share link that
   * resolves to a place page with no @lat,lng or !3d!4d anywhere — Google's
   * mobile format identifies the place by name + feature id instead. Without
   * the place-name-geocode fallback this returned null outright, surfacing
   * as "Couldn't find a location in that link" for a link that's completely
   * valid, just in a format extractLatLngFromGoogleMapsUrl can't read
   * coordinates out of because there aren't any to read.
   */
  const REAL_MOBILE_SHARE_PLACE_URL =
    'https://www.google.com/maps/place/Altamount+Road+Cha+Raja,+Eastman+House,+SK+Barodawala+Marg,+Tardeo,+Mumbai,+Maharashtra+400026/data=!4m2!3m1!1s0x3be7cf007a0e071d:0x76ba3553534a730d!18m1!1e1?utm_source=mstt_1'

  it('falls back to geocoding the place name when a short link resolves to a place page with no coordinates', async () => {
    // One redirect hop (maps.app.goo.gl -> the place URL, confirmed live),
    // then a terminal 200 with no further Location when that place URL
    // itself is fetched.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(redirectTo(REAL_MOBILE_SHARE_PLACE_URL))
        .mockResolvedValue(finalResponse())
    )
    // Confirmed live against Nominatim: the full string and the next two
    // progressively-shorter attempts all draw a blank (OSM has no idea what
    // "Eastman House" or this mandal is) — only the 4th, most-generic
    // attempt succeeds.
    geocodeAddressMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ lat: 18.9722351, lng: 72.8203423 })

    const result = await resolveGoogleMapsLink('https://maps.app.goo.gl/J1Se6o5qpQVjuFCH6')

    expect(result).toEqual({ lat: 18.9722351, lng: 72.8203423 })
    expect(geocodeAddressMock).toHaveBeenNthCalledWith(
      1,
      'Altamount Road Cha Raja, Eastman House, SK Barodawala Marg, Tardeo, Mumbai, Maharashtra 400026'
    )
    expect(geocodeAddressMock).toHaveBeenNthCalledWith(4, 'Tardeo, Mumbai, Maharashtra 400026')
  })

  it('applies the same place-name fallback to a full URL pasted directly, not just a short link', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    geocodeAddressMock.mockResolvedValueOnce({ lat: 18.97, lng: 72.82 })

    const result = await resolveGoogleMapsLink(REAL_MOBILE_SHARE_PLACE_URL)

    expect(result).toEqual({ lat: 18.97, lng: 72.82 })
    // No redirect to follow — a full URL never needs the network fetch loop.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('caps geocode attempts and returns null if every one fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(redirectTo(REAL_MOBILE_SHARE_PLACE_URL))
        .mockResolvedValue(finalResponse())
    )
    geocodeAddressMock.mockResolvedValue(null)

    expect(await resolveGoogleMapsLink('https://maps.app.goo.gl/J1Se6o5qpQVjuFCH6')).toBeNull()
    // 6 comma-separated segments in the fixture; the cap (8) never binds here.
    expect(geocodeAddressMock).toHaveBeenCalledTimes(6)
  })

  /**
   * Real report: this Kalyan share link resolves to a place page with a Plus
   * Code + building/road name and 8 comma segments — one more than the
   * Tardeo fixture above needed. Confirmed live against Nominatim: the first
   * 5 attempts (anything still carrying the plus code, mandal, road, or
   * colony name) all draw a blank; only the 6th, "Mumbai, Kalyan, Maharashtra
   * 421201", resolves. The old cap of 4 gave up one segment short of that.
   */
  const REAL_KALYAN_SHARE_PLACE_URL =
    'https://www.google.com/maps/place/63GW%2B7MX+Thakurlicha+Maharaja+Ganeshotsav+Mandal,+SKS+Marg,+Thakurli,+Chandrakant+Dhuru+Wadi,+Railway+Colony,+Mumbai,+Kalyan,+Maharashtra+421201/data=!4m2!3m1!1s0x3be795f232f90685:0x4ad99cf374b66c98!18m1!1e1'

  it('reaches the 6th, most-generic attempt for an 8-segment address', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    geocodeAddressMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ lat: 19.2396742, lng: 73.1366482 })

    const result = await resolveGoogleMapsLink(REAL_KALYAN_SHARE_PLACE_URL)

    expect(result).toEqual({ lat: 19.2396742, lng: 73.1366482 })
    expect(geocodeAddressMock).toHaveBeenCalledTimes(6)
    expect(geocodeAddressMock).toHaveBeenNthCalledWith(6, 'Mumbai, Kalyan, Maharashtra 421201')
  })
})
