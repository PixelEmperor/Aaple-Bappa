import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { requireEnv } from '@/lib/env'

/**
 * Refreshes the Supabase session cookie on every request (design-plan.md
 * Milestone 8). Named `proxy.ts`/`proxy()`, not `middleware.ts`/`middleware()` —
 * Next.js 16 renamed the convention (see src/lib/supabase/server.ts's comment).
 * Server Components can't write cookies at all, so without this, a session
 * nearing expiry would silently drop moderators to logged-out on the next
 * navigation instead of refreshing transparently.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Triggers a token refresh when the access token is stale; the setAll
  // callback above then persists the refreshed cookies onto `response`.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: ['/admin/:path*'],
}
