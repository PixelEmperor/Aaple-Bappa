import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-url'

/**
 * /robots.txt (design-plan.md's SEO pass). /admin is a moderator tool with
 * no public content of its own — nothing there should ever show up in
 * search results, and disallowing it also keeps crawlers from wasting
 * budget hammering an auth-gated route that 307s them straight to /login.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/admin',
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
