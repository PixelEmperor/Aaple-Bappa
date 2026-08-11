import { createClient } from '@supabase/supabase-js'
import { requireEnv } from '@/lib/env'

/**
 * Anon client for statically-renderable public reads (design-plan.md
 * Milestone 4's ISR directory page). Deliberately doesn't touch cookies —
 * `cookies()`/`headers()` are Next.js "Dynamic APIs": calling either
 * anywhere in a route's render tree opts the whole route out of static
 * rendering, which would defeat the ISR requirement for no benefit (public
 * reads need no session; RLS's `mandals_public_read` policy applies to the
 * anon role regardless of any cookie).
 */
export function createSupabasePublicClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  )
}
