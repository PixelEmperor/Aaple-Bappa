import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveGoogleMapsLink } from './google-maps-link'

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
      vi.fn().mockResolvedValue({ url: 'https://www.google.com/maps/@19.076,72.8777,15z' })
    )

    const result = await resolveGoogleMapsLink('https://maps.app.goo.gl/abCD1234')

    expect(result).toEqual({ lat: 19.076, lng: 72.8777 })
  })

  it('rejects a short link that redirects somewhere other than a Google domain', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ url: 'https://evil.example/@19.076,72.8777,15z' })
    )

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
