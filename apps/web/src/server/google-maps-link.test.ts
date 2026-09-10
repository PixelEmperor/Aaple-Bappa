import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveGoogleMapsLink } from './google-maps-link'

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
})
