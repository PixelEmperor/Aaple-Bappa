/**
 * Server-side photo validation for submissions.create (scope.md §8,
 * design-plan.md Milestone 7): type + size check, never trusting the
 * client-claimed MIME type alone — it's sniffed from the actual bytes.
 */

export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp'

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024 // 2MB, scope §7/§8

const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/]+=?=?)$/

export type ParsedImage = {
  mimeType: ImageMimeType
  buffer: Buffer
}

export type ImageValidationError =
  'invalid_data_url' | 'too_large' | 'unsupported_type' | 'mime_mismatch'

export type ImageValidationResult =
  { ok: true; image: ParsedImage } | { ok: false; error: ImageValidationError }

export function parseAndValidateImageDataUrl(dataUrl: string): ImageValidationResult {
  const match = DATA_URL_PATTERN.exec(dataUrl)
  if (!match) {
    return { ok: false, error: 'invalid_data_url' }
  }

  const claimedMimeType = match[1] as ImageMimeType
  const buffer = Buffer.from(match[2], 'base64')

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'too_large' }
  }

  const actualMimeType = sniffImageMimeType(buffer)
  if (!actualMimeType) {
    return { ok: false, error: 'unsupported_type' }
  }
  if (actualMimeType !== claimedMimeType) {
    return { ok: false, error: 'mime_mismatch' }
  }

  return { ok: true, image: { mimeType: actualMimeType, buffer } }
}

function sniffImageMimeType(buffer: Buffer): ImageMimeType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png'
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

export const IMAGE_EXTENSION_BY_MIME_TYPE: Record<ImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
