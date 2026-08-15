import 'server-only'
import { TRPCError } from '@trpc/server'
import { randomUUID } from 'node:crypto'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role'
import { IMAGE_EXTENSION_BY_MIME_TYPE, parseAndValidateImageDataUrl } from './image-validation'

/**
 * Server forwards the upload to mandal-photos (scope.md §8) — the client
 * never writes to storage directly, since anon has no insert policy on
 * storage.objects (supabase/migrations/0004_storage.sql).
 */
export async function uploadSubmissionPhoto(dataUrl: string): Promise<string> {
  const result = parseAndValidateImageDataUrl(dataUrl)
  if (!result.ok) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Invalid photo (${result.error}).` })
  }

  const { mimeType, buffer } = result.image
  const path = `submissions/${randomUUID()}.${IMAGE_EXTENSION_BY_MIME_TYPE[mimeType]}`

  const supabase = createSupabaseServiceRoleClient()
  const { error } = await supabase.storage.from('mandal-photos').upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  })

  if (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Photo upload failed: ${error.message}`,
    })
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('mandal-photos').getPublicUrl(path)

  return publicUrl
}
