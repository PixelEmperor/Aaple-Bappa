import { Suspense } from 'react'
import { DirectoryView } from '@/components/DirectoryView'
import { createSupabasePublicClient } from '@/lib/supabase/public'
import { appRouter } from '@/server/routers/_app'
import { mandalsListInputSchema, type MandalsListOutput } from '@/shared/schemas'

// ISR for the default (unfiltered) view (design-plan.md Milestone 4). This page
// deliberately never reads searchParams, cookies(), or headers() — any of
// those would opt the whole route out of static rendering. A shared/filtered
// link instead loads this same static shell and DirectoryView (client-side)
// picks up the URL's filters from there, per "Client-side data via
// tRPC-react-query; keep filter state in sync with URL" in the milestone spec.
export const revalidate = 3600

async function getInitialData(): Promise<MandalsListOutput | null> {
  try {
    // The cookie-bound context (src/server/context.ts) is for the tRPC route
    // handler, which is inherently per-request anyway. This page's context
    // stays cookie-free on purpose — see lib/supabase/public.ts.
    const caller = appRouter.createCaller({ supabase: createSupabasePublicClient(), user: null })
    return await caller.mandals.list(mandalsListInputSchema.parse({}))
  } catch {
    // Supabase isn't configured in this environment yet (design-plan.md
    // Milestone 1) — render a clear notice below instead of a 500 page.
    return null
  }
}

export default async function Home() {
  const initialData = await getInitialData()

  if (!initialData) {
    return (
      <main
        id="main-content"
        className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <h1 className="text-2xl font-bold">Directory not available yet</h1>
        <p className="max-w-md text-ink-soft">
          The database isn&apos;t configured in this environment. Copy{' '}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-sm">.env.example</code>{' '}
          to{' '}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-sm">.env.local</code>{' '}
          and fill in your Supabase project details.
        </p>
      </main>
    )
  }

  return (
    // useSearchParams() inside DirectoryView requires a Suspense boundary in
    // the App Router. initialData is already available synchronously here,
    // so the fallback shouldn't be visible outside of hydration.
    <Suspense fallback={null}>
      <DirectoryView initialData={initialData} />
    </Suspense>
  )
}
