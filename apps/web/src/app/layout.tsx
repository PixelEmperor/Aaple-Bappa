import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/Header'
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
  title: 'Aaple Bappa',
  description:
    'A free, community-built guide to Ganpati mandals across the Mumbai Metropolitan Region.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
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
      </body>
    </html>
  )
}
