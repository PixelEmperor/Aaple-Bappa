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

export async function getAllMandalSlugs(): Promise<string[]> {
  const { items } = await publicCaller().mandals.list(
    mandalsListInputSchema.parse({ pageSize: 500 })
  )
  return items.map((mandal) => mandal.slug)
}
