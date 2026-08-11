import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireEnv } from '@/lib/env'

/**
 * Anon client for Server Components, Route Handlers, and tRPC context. RLS-restricted
 * (supabase/migrations/0003_rls.sql). Session cookie writes are best-effort: Server
 * Components can't set cookies at all (the try/catch below), so once Milestone 8 adds
 * auth, `proxy.ts` — not `middleware.ts`, per Next.js 16 — must handle session refresh.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component render, which can't set cookies.
          }
        },
      },
    }
  )
}
