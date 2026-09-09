import { beforeEach, describe, expect, it, vi } from 'vitest'

const headerStore = new Map<string, string>()

vi.mock('next/headers', () => ({
  headers: async () => headerStore,
}))

const { clientIp } = await import('./client-ip')

function given(headers: Record<string, string>) {
  headerStore.clear()
  for (const [key, value] of Object.entries(headers)) headerStore.set(key, value)
}

describe('clientIp', () => {
  beforeEach(() => headerStore.clear())

  /**
   * The bug this function exists to avoid: a proxy *appends* to
   * X-Forwarded-For, so a client that sends its own header arrives as
   * "<spoofed>, <real>". Reading the first entry — which is what this used to
   * do — reads whatever the client typed, and a fresh value per request
   * defeats the IP rate limit entirely.
   */
  it('ignores a client-spoofed X-Forwarded-For entry in favour of the edge header', async () => {
    given({
      'x-forwarded-for': '1.2.3.4, 203.0.113.9',
      'cf-connecting-ip': '203.0.113.9',
    })
    await expect(clientIp()).resolves.toBe('203.0.113.9')
  })

  it('takes the last X-Forwarded-For hop when no edge header is present', async () => {
    // The last entry is the peer the closest trusted proxy actually saw;
    // everything before it is caller-supplied.
    given({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 203.0.113.9' })
    await expect(clientIp()).resolves.toBe('203.0.113.9')
  })

  it('prefers Cloudflare’s header over Vercel’s forwarded chain', async () => {
    given({
      'cf-connecting-ip': '203.0.113.9',
      'x-vercel-forwarded-for': '1.2.3.4',
    })
    await expect(clientIp()).resolves.toBe('203.0.113.9')
  })

  it('falls back to x-real-ip, then the Vercel chain', async () => {
    given({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4' })
    await expect(clientIp()).resolves.toBe('203.0.113.7')

    given({ 'x-vercel-forwarded-for': '1.2.3.4, 203.0.113.8' })
    await expect(clientIp()).resolves.toBe('203.0.113.8')
  })

  it('trims whitespace and skips empty hops', async () => {
    given({ 'x-forwarded-for': '1.2.3.4 ,  203.0.113.9 , ' })
    await expect(clientIp()).resolves.toBe('203.0.113.9')
  })

  it('returns a stable placeholder when no IP header is present', async () => {
    given({})
    await expect(clientIp()).resolves.toBe('unknown')
  })
})
