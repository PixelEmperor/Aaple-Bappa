import 'server-only'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { TRPCError } from '@trpc/server'
import { randomUUID } from 'node:crypto'
import { requireEnv } from '@/lib/env'
import { createR2Client } from '@/lib/r2'
import { IMAGE_EXTENSION_BY_MIME_TYPE, parseAndValidateImageDataUrl } from './image-validation'

/**
 * Server forwards the upload to Cloudflare R2 (scope.md §8) — the client
 * never writes to the bucket directly; only this server code holds R2
 * credentials, and only after the submission API validates the upload.
 */
export async function uploadSubmissionPhoto(dataUrl: string): Promise<string> {
  const result = parseAndValidateImageDataUrl(dataUrl)
  if (!result.ok) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Invalid photo (${result.error}).` })
  }

  const { mimeType, buffer } = result.image
  const key = `submissions/${randomUUID()}.${IMAGE_EXTENSION_BY_MIME_TYPE[mimeType]}`

  try {
    await createR2Client().send(
      new PutObjectCommand({
        Bucket: requireEnv('CLOUDFLARE_R2_BUCKET_NAME'),
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    )
  } catch (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Photo upload failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    })
  }

  // CLOUDFLARE_R2_PUBLIC_URL is the bucket's public base — either its
  // r2.dev subdomain or a custom domain mapped to it in the Cloudflare
  // dashboard; either way it's configured once per environment, not derived.
  return `${requireEnv('CLOUDFLARE_R2_PUBLIC_URL')}/${key}`
}
