import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_BYTES, parseAndValidateImageDataUrl } from './image-validation'

function dataUrl(mimeType: string, buffer: Buffer): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const WEBP_HEADER = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
])

describe('parseAndValidateImageDataUrl', () => {
  it('accepts a real JPEG', () => {
    const result = parseAndValidateImageDataUrl(dataUrl('image/jpeg', JPEG_HEADER))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.image.mimeType).toBe('image/jpeg')
  })

  it('accepts a real PNG', () => {
    const result = parseAndValidateImageDataUrl(dataUrl('image/png', PNG_HEADER))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.image.mimeType).toBe('image/png')
  })

  it('accepts a real WebP', () => {
    const result = parseAndValidateImageDataUrl(dataUrl('image/webp', WEBP_HEADER))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.image.mimeType).toBe('image/webp')
  })

  it('rejects a string that is not a data URL at all', () => {
    const result = parseAndValidateImageDataUrl('not-a-data-url')
    expect(result).toEqual({ ok: false, error: 'invalid_data_url' })
  })

  it('rejects a claimed type outside the allow-list', () => {
    const result = parseAndValidateImageDataUrl(
      `data:image/gif;base64,${JPEG_HEADER.toString('base64')}`
    )
    expect(result).toEqual({ ok: false, error: 'invalid_data_url' })
  })

  it('rejects when the claimed MIME type does not match the actual bytes', () => {
    // Claims PNG but the bytes are really a JPEG — the classic spoofing case.
    const result = parseAndValidateImageDataUrl(dataUrl('image/png', JPEG_HEADER))
    expect(result).toEqual({ ok: false, error: 'mime_mismatch' })
  })

  it('rejects bytes that match no known image signature', () => {
    const result = parseAndValidateImageDataUrl(
      dataUrl('image/jpeg', Buffer.from('plain text, not an image'))
    )
    expect(result).toEqual({ ok: false, error: 'unsupported_type' })
  })

  it('rejects a payload over the size limit', () => {
    const oversized = Buffer.concat([JPEG_HEADER, Buffer.alloc(MAX_IMAGE_BYTES)])
    const result = parseAndValidateImageDataUrl(dataUrl('image/jpeg', oversized))
    expect(result).toEqual({ ok: false, error: 'too_large' })
  })

  it('accepts a payload right at the size limit', () => {
    const atLimit = Buffer.concat([JPEG_HEADER, Buffer.alloc(MAX_IMAGE_BYTES - JPEG_HEADER.length)])
    const result = parseAndValidateImageDataUrl(dataUrl('image/jpeg', atLimit))
    expect(result.ok).toBe(true)
  })
})
