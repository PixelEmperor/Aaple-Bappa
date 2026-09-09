import { describe, expect, it } from 'vitest'
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DATA_URL_LENGTH,
  mandalsListInputSchema,
  newMandalPayloadSchema,
  photoUrlSchema,
  submissionEditablePayloadSchema,
} from './schemas'

const BASE_PAYLOAD = {
  name: 'Test Mandal',
  area: 'Test Area',
  location: { kind: 'pin' as const, lat: 19.076, lng: 72.8777 },
  is_public: true,
}

describe('photoUrlSchema', () => {
  it('accepts an absolute https URL', () => {
    expect(photoUrlSchema.parse('https://photos.example/p.jpg')).toBe(
      'https://photos.example/p.jpg'
    )
  })

  /**
   * photo_url ends up in an <img src> and an OpenGraph tag
   * (src/app/mandal/[slug]/page.tsx), so a `javascript:` or `data:` value
   * here is the classic stored-XSS payload.
   */
  it('rejects the URL schemes that make a stored photo_url dangerous', () => {
    for (const url of [
      'javascript:alert(document.cookie)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'data:image/svg+xml,<svg onload="alert(1)"/>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      expect(photoUrlSchema.safeParse(url).success).toBe(false)
    }
  })

  it('rejects http and relative URLs', () => {
    expect(photoUrlSchema.safeParse('http://photos.example/p.jpg').success).toBe(false)
    expect(photoUrlSchema.safeParse('/local/p.jpg').success).toBe(false)
  })

  it('rejects an absurdly long URL', () => {
    expect(photoUrlSchema.safeParse(`https://x.example/${'a'.repeat(3000)}`).success).toBe(false)
  })
})

describe('newMandalPayloadSchema photo_data_url bound', () => {
  it('derives the cap from MAX_IMAGE_BYTES rather than a magic number', () => {
    // Base64 is 4 characters per 3 bytes, so the cap must exceed the byte
    // limit — a cap below it would reject images that are actually in-spec.
    expect(MAX_IMAGE_DATA_URL_LENGTH).toBeGreaterThan(MAX_IMAGE_BYTES)
    expect(MAX_IMAGE_DATA_URL_LENGTH).toBeLessThan(MAX_IMAGE_BYTES * 2)
  })

  it('accepts a data URL at the limit', () => {
    const dataUrl = `data:image/webp;base64,${'A'.repeat(MAX_IMAGE_DATA_URL_LENGTH - 23)}`
    expect(
      newMandalPayloadSchema.safeParse({ ...BASE_PAYLOAD, photo_data_url: dataUrl }).success
    ).toBe(true)
  })

  /**
   * The point of the length bound: the MAX_IMAGE_BYTES check in
   * server/image-validation.ts can only run after Buffer.from(..., 'base64')
   * has already materialized the decoded image, so an unbounded string here
   * is decoded before it can be rejected.
   */
  it('rejects an oversized data URL before it would ever be base64-decoded', () => {
    const oversized = `data:image/webp;base64,${'A'.repeat(MAX_IMAGE_DATA_URL_LENGTH + 1)}`
    expect(
      newMandalPayloadSchema.safeParse({ ...BASE_PAYLOAD, photo_data_url: oversized }).success
    ).toBe(false)
  })
})

describe('free-text input bounds', () => {
  it('rejects an unbounded search string that would become an ilike pattern', () => {
    expect(mandalsListInputSchema.safeParse({ search: 'a'.repeat(201) }).success).toBe(false)
    expect(mandalsListInputSchema.safeParse({ search: 'lalbaug' }).success).toBe(true)
  })

  it('bounds the area filter too', () => {
    expect(mandalsListInputSchema.safeParse({ area: 'x'.repeat(201) }).success).toBe(false)
  })
})

describe('submissionEditablePayloadSchema', () => {
  const VALID = {
    name: 'Test Mandal',
    area: 'Test Area',
    zone: 'South Mumbai' as const,
    lat: 19.076,
    lng: 72.8777,
    established_year: 1990,
    timings: null,
    nearest_station: null,
    description: null,
    tags: null,
    official_contact: null,
    is_public: true,
    photo_url: null,
  }

  it('accepts a well-formed moderator edit', () => {
    expect(submissionEditablePayloadSchema.safeParse(VALID).success).toBe(true)
  })

  it('rejects a non-https photo_url from a moderator too', () => {
    expect(
      submissionEditablePayloadSchema.safeParse({ ...VALID, photo_url: 'javascript:alert(1)' })
        .success
    ).toBe(false)
  })
})
