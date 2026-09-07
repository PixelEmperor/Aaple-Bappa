'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'

const NAV_LINKS = [
  { href: '/', label: 'Directory' },
  { href: '/map', label: 'Map' },
  { href: '/helplines', label: 'Helplines' },
] as const

export function Header() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-sm">
      <div className="garland" aria-hidden="true" />
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-5 px-4 sm:px-6">
        <Link href="/" className="mr-auto flex items-center gap-2.5">
          {/* Two theme variants of the same designed mark (the wordmark is
              baked into the artwork itself, so no separate text label is
              needed) — swapped via the `dark:` variant, not JS, so there's
              no flash of the wrong one before hydration. */}
          <Image
            src="/aaple-bappa-logo-light.svg"
            alt="Aaple Bappa"
            width={88}
            height={88}
            priority
            className="h-11 w-11 flex-none dark:hidden"
          />
          <Image
            src="/aaple-bappa-logo-dark.svg"
            alt="Aaple Bappa"
            width={88}
            height={88}
            priority
            className="hidden h-11 w-11 flex-none dark:block"
          />
          <span className="text-[0.625rem] font-semibold tracking-widest text-ink-faint uppercase">
            Mumbai
            <br />
            Ganesh Utsav
          </span>
        </Link>

        <nav className="hidden gap-1 sm:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  active
                    ? 'bg-accent-tint text-accent-deep'
                    : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/submit"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-deep"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="hidden sm:inline">Add a mandal</span>
          </Link>
        </div>
      </div>
    </header>
  )
}
