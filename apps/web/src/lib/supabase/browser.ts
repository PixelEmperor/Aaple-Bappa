import { createBrowserClient } from '@supabase/ssr'

/**
 * Anon client for use in Client Components. RLS-restricted (supabase/migrations/0003_rls.sql).
 *
 * Reads NEXT_PUBLIC_ vars via static `process.env.X` access, not the generic
 * requireEnv(name) helper: Next.js's client-bundle env inlining only
 * recognizes literal `process.env.NEXT_PUBLIC_*` references at compile time.
 * A dynamic `process.env[name]` lookup (what requireEnv does) can't be
 * statically inlined and silently resolves to undefined in the browser,
 * even though the same variable works fine server-side.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill it in.'
    )
  }

  return createBrowserClient(url, anonKey)
}
