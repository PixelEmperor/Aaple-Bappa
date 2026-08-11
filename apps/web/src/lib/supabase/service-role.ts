import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { requireEnv } from '@/lib/env'

/**
 * Bypasses RLS entirely (design-plan.md §1). Used only by `moderatorProcedure`
 * for the moderators-table check and moderator writes — never for public reads.
 * The `server-only` import makes it a build error to pull this into a Client
 * Component, on top of the key never being NEXT_PUBLIC_-prefixed.
 */
export function createSupabaseServiceRoleClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
}
