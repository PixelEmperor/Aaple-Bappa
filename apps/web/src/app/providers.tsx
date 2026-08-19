'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import { Suspense, useEffect, useState } from 'react'
import superjson from 'superjson'
import { PostHogPageView } from '@/components/PostHogPageView'
import { initPostHog } from '@/lib/posthog'
import { trpc } from '@/lib/trpc/react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
    })
  )

  useEffect(() => {
    initPostHog()
  }, [])

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {/* useSearchParams() requires a Suspense boundary in the App Router
            (same reasoning as DirectoryView/MapView). */}
        <Suspense fallback={null}>
          <PostHogPageView />
        </Suspense>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  )
}
