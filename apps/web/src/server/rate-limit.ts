import 'server-only'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role'

const WINDOW_SECONDS = 15 * 60
const MAX_REQUESTS_PER_WINDOW = 5

/**
 * Calls the atomic rate_limit_check() Postgres function (see
 * supabase/migrations/0005_rate_limits.sql) rather than doing a
 * read-then-write here, which would race under concurrent requests for the
 * same key.
 */
export async function checkRateLimit(key: string): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient()
  const { data, error } = await supabase.rpc('rate_limit_check', {
    p_key: key,
    p_window_seconds: WINDOW_SECONDS,
    p_max_requests: MAX_REQUESTS_PER_WINDOW,
  })

  if (error) {
    throw new Error(`Rate limit check failed: ${error.message}`)
  }

  return data === true
}
