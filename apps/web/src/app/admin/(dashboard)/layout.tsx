import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * Server-side moderator gate (design-plan.md Milestone 8, scope §9: "checks
 * moderator role server-side on every request, not just client-side route
 * guarding"). Lives in a `(dashboard)` route group so `/admin/login` — which
 * must stay reachable while signed out — isn't nested under this layout.
 *
 * Mirrors moderatorProcedure's own check (src/server/trpc.ts): the
 * `moderators` table has RLS enabled with no policies at all
 * (supabase/migrations/0003_rls.sql), so only the service-role client can
 * read it — this check *is* the authorization boundary.
 */
export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  const serviceRole = createSupabaseServiceRoleClient()
  const { data: moderator } = await serviceRole
    .from('moderators')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!moderator) {
    redirect('/admin/login')
  }

  return <>{children}</>
}
