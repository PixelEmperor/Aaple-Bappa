import { cache } from 'react'
import { createSupabasePublicClient } from '@/lib/supabase/public'
import { appRouter } from '@/server/routers/_app'
import { mandalsGetBySlugInputSchema, mandalsListInputSchema } from '@/shared/schemas'

/**
 * Cookie-free public caller (see lib/supabase/public.ts) so pages using this
 * stay statically renderable — used by both the directory (M4) and the
 * detail page (M6).
 */
function publicCaller() {
  return appRouter.createCaller({ supabase: createSupabasePublicClient(), user: null })
}

/**
 * cache() dedupes this within a single request/render pass — the detail
 * page's generateMetadata and the page component itself both need the same
 * mandal, and without this they'd each hit Supabase separately.
 */
export const getMandalBySlug = cache(async (slug: string) => {
  return publicCaller().mandals.getBySlug(mandalsGetBySlugInputSchema.parse({ slug }))
})

/**
 * Feeds generateStaticParams, which build-time-fails the whole route (and
 * thus the whole `next build`) if it throws — an empty list here just
 * means zero mandal pages get prebuilt, same "not configured yet" fallback
 * page.tsx and helplines/page.tsx already use for their own data. CI in
 * particular has no Supabase credentials configured, so this always hits
 * the catch there.
 */
export async function getAllMandalSlugs(): Promise<string[]> {
  try {
    const { items } = await publicCaller().mandals.list(
      mandalsListInputSchema.parse({ pageSize: 500 })
    )
    return items.map((mandal) => mandal.slug)
  } catch {
    return []
  }
}
