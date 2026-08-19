import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { groupHelplinesByCategory } from '@/lib/helplines-grouping'
import { createSupabasePublicClient } from '@/lib/supabase/public'
import { appRouter } from '@/server/routers/_app'
import {
  helplinesListInputSchema,
  type HelplineCategory,
  type HelplinesListOutput,
} from '@/shared/schemas'

// ISR, same shape as page.tsx's directory listing (design-plan.md Milestone 9):
// static, cookie-free fetch so this page can be prerendered and revalidated
// rather than rendered per-request.
export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Helplines · Aaple Bappa',
}

const CALL_ICON = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
  </svg>
)

const CATEGORIES: {
  key: HelplineCategory
  label: string
  sub: string
  colorClass: string
  icon: ReactNode
}[] = [
  {
    key: 'police',
    label: 'Police',
    sub: 'Emergency & control rooms',
    colorClass: 'bg-accent-tint text-accent-deep',
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5l-8-3Z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'medical',
    label: 'Medical',
    sub: 'Ambulance & first aid',
    colorClass: 'bg-crit-tint text-crit',
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'traffic',
    label: 'Traffic',
    sub: 'Diversions & assistance',
    colorClass: 'bg-warn-tint text-warn',
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <rect x="8" y="2" width="8" height="20" rx="4" />
        <circle cx="12" cy="7" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="17" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    key: 'bmc_control_room',
    label: 'BMC control room',
    sub: 'Civic & disaster response',
    colorClass: 'bg-good-tint text-good',
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" strokeLinejoin="round" />
      </svg>
    ),
  },
]

async function getHelplines(): Promise<HelplinesListOutput | null> {
  try {
    const caller = appRouter.createCaller({ supabase: createSupabasePublicClient(), user: null })
    return await caller.helplines.list(helplinesListInputSchema.parse({}))
  } catch {
    // Supabase isn't configured in this environment yet — same fallback as
    // page.tsx's directory listing.
    return null
  }
}

export default async function HelplinesPage() {
  const helplines = await getHelplines()

  if (!helplines) {
    return (
      <main
        id="main-content"
        className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <h1 className="text-2xl font-bold">Helplines not available yet</h1>
        <p className="max-w-md text-ink-soft">
          The database isn&apos;t configured in this environment.
        </p>
      </main>
    )
  }

  const grouped = groupHelplinesByCategory(helplines)

  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6"
    >
      <div>
        <span className="text-xs font-bold tracking-widest text-accent-deep uppercase">
          Stay safe
        </span>
        <h1 className="mt-2 text-2xl font-bold">Helplines</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Emergency contacts across the Mumbai Metropolitan Region. Tap any number to call.
        </p>
      </div>

      {helplines.length === 0 ? (
        <p role="status" className="py-12 text-center text-ink-faint">
          No helplines listed yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CATEGORIES.map((category) => {
            const entries = grouped[category.key]
            if (!entries || entries.length === 0) return null

            return (
              <section
                key={category.key}
                className="rounded-lg border border-line bg-surface p-5 shadow-sm"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span
                    className={`grid size-10 flex-none place-items-center rounded-lg ${category.colorClass}`}
                  >
                    {category.icon}
                  </span>
                  <div>
                    <h2 className="text-base font-bold">{category.label}</h2>
                    <p className="text-xs font-semibold text-ink-faint">{category.sub}</p>
                  </div>
                </div>
                <ul className="flex flex-col">
                  {entries.map((helpline) => (
                    <li
                      key={helpline.id}
                      className="flex items-center justify-between gap-4 border-t border-line-soft py-2.5"
                    >
                      <div>
                        <div className="text-sm font-semibold">{helpline.area ?? 'Citywide'}</div>
                        {helpline.notes && (
                          <div className="text-xs text-ink-faint">{helpline.notes}</div>
                        )}
                      </div>
                      <a
                        href={`tel:${helpline.phone}`}
                        className="inline-flex items-center gap-1.5 text-sm font-bold whitespace-nowrap text-accent-deep hover:underline"
                      >
                        {CALL_ICON}
                        {helpline.phone}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
