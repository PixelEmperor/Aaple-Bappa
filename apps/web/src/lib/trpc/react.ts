'use client'

import { createTRPCReact } from '@trpc/react-query'
import type { AppRouter } from '@/server/routers/_app'

/**
 * Client-side hooks for interactive fetching (filtering, mutations).
 * Initial ISR/SSR page data uses a direct server-side caller instead —
 * see src/app/page.tsx.
 */
export const trpc = createTRPCReact<AppRouter>()
