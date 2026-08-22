import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadSubmissionPhoto } from './photo-upload'

const send = vi.fn()

vi.mock('@/lib/r2', () => ({
  createR2Client: () => ({ send }),
}))

function dataUrl(mimeType: string, buffer: Buffer): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])

describe('uploadSubmissionPhoto', () => {
  beforeEach(() => {
    send.mockReset()
    vi.stubEnv('CLOUDFLARE_R2_ACCOUNT_ID', 'account-id')
    vi.stubEnv('CLOUDFLARE_R2_ACCESS_KEY_ID', 'access-key')
    vi.stubEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY', 'secret-key')
    vi.stubEnv('CLOUDFLARE_R2_BUCKET_NAME', 'mandal-photos')
    vi.stubEnv('CLOUDFLARE_R2_PUBLIC_URL', 'https://photos.example.com')
  })

  it('uploads the validated image and returns a public R2 URL', async () => {
    send.mockResolvedValue({})

    const url = await uploadSubmissionPhoto(dataUrl('image/jpeg', JPEG))

    expect(send).toHaveBeenCalledOnce()
    expect(url).toMatch(/^https:\/\/photos\.example\.com\/submissions\/[\w-]+\.jpg$/)
  })

  it('rejects an invalid photo before ever touching R2', async () => {
    await expect(uploadSubmissionPhoto('not-a-data-url')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('surfaces an R2 failure as an INTERNAL_SERVER_ERROR', async () => {
    send.mockRejectedValue(new Error('bucket unreachable'))

    await expect(uploadSubmissionPhoto(dataUrl('image/jpeg', JPEG))).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })
  })
})
