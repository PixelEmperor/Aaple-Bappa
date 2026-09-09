import 'server-only'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role'
import { internalError } from './errors'

/**
 * Calls the atomic rate_limit_check() Postgres function (see
 * supabase/migrations/0009_lock_down_privileges.sql) rather than doing a
 * read-then-write here, which would race under concurrent requests for the
 * same key.
 *
 * The window (15 min) and cap (5 requests) now live in that function rather
 * than being passed in: as arguments they were a way to switch the limiter
 * off, since `p_window_seconds: 0` resets any key's counter on every call.
 */
export async function checkRateLimit(key: string): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient()
  const { data, error } = await supabase.rpc('rate_limit_check', { p_key: key })

  if (error) {
    // A bare Error would have its message serialized into the tRPC response;
    // this is a Postgres error, so it goes to Sentry instead (./errors.ts).
    throw internalError('rate_limit_check', error)
  }

  return data === true
}
