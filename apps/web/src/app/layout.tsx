import { Analytics } from '@vercel/analytics/next'
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/Header'
import { siteUrl } from '@/lib/site-url'
import { themeInitScript } from '@/lib/theme'
import { Providers } from './providers'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  // Resolves every relative URL in a page's own `metadata` export (OG/twitter
  // images, canonical links) against this origin — without it, a mandal page
  // whose openGraph.images was ever a root-relative path would share as a
  // broken image on X/WhatsApp/etc. Every mandal photo happens to already be
  // an absolute R2 URL (mandal/[slug]/page.tsx), so this is currently
  // dormant insurance more than an active fix, but it's the standard the
  // Metadata API expects a production site to set.
  metadataBase: new URL(siteUrl()),
  title: 'Aaple Bappa',
  description:
    'A free, community-built guide to Ganpati mandals across the Mumbai Metropolitan Region.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The theme script below deliberately sets data-theme on this element
      // before hydration, from a stored preference the server has no way to
      // know — a real, intentional mismatch, not a bug to fix. This only
      // suppresses the warning for this element's own attributes, not its
      // children, so an actual hydration mismatch elsewhere still surfaces.
      suppressHydrationWarning
    >
      <head>
        {/* Blocking, pre-hydration: applies a stored theme choice before
            first paint so toggling never flashes the previous theme
            (src/lib/theme.ts). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
      </head>
      <body className="flex min-h-full flex-col bg-paper text-ink">
        {/* WCAG 2.4.1 Bypass Blocks (design-plan.md Milestone 10's
            accessibility pass): visually hidden until focused, so keyboard
            users can skip the header/nav on every page straight to #main-content. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to main content
        </a>
        <Providers>
          <Header />
          {children}
        </Providers>
        {/* Vercel's own pageview counter — separate from PostHog, no shared
            config; a no-op in local dev and any deploy Vercel doesn't own. */}
        <Analytics />
      </body>
    </html>
  )
}
