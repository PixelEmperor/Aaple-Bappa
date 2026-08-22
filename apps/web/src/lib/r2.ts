import 'server-only'
import { S3Client } from '@aws-sdk/client-s3'
import { requireEnv } from '@/lib/env'

/**
 * S3-compatible client for Cloudflare R2, which hosts mandal photos
 * (design-plan.md §1 update: moved off Supabase Storage for R2's
 * zero-egress-fee pricing ahead of festival-week traffic). `region: 'auto'`
 * is required by the S3 SDK's types but unused by R2 itself
 * (developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3).
 */
export function createR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${requireEnv('CLOUDFLARE_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv('CLOUDFLARE_R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
    },
  })
}
