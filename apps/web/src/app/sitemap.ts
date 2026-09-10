import type { MetadataRoute } from 'next'
import { getAllMandalSlugs } from '@/lib/mandals-data'
import { siteUrl } from '@/lib/site-url'

/**
 * /sitemap.xml (design-plan.md's SEO pass). Static routes plus every
 * currently-published mandal — the same slug list generateStaticParams uses
 * (src/app/mandal/[slug]/page.tsx), so a mandal is only ever listed here once
 * it's actually reachable. /admin and /admin/login are moderator-only and
 * excluded, same as robots.ts.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()
  const slugs = await getAllMandalSlugs()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/map`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/submit`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/helplines`, changeFrequency: 'monthly', priority: 0.3 },
  ]

  const mandalRoutes: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: `${base}/mandal/${slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...staticRoutes, ...mandalRoutes]
}
