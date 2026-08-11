import { createBrowserClient } from '@supabase/ssr'
import { requireEnv } from '@/lib/env'

/** Anon client for use in Client Components. RLS-restricted (supabase/migrations/0003_rls.sql). */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  )
}
