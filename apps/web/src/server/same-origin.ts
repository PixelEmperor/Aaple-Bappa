import 'server-only'

/**
 * CSRF origin check for the tRPC endpoint.
 *
 * The moderator mutations — submissions.review, submissions.updatePayload —
 * authorize on the Supabase session cookie alone, so without this any page a
 * signed-in moderator visits could approve or reject submissions on their
 * behalf. The usual reassurance that tRPC is safe because it requires
 * `content-type: application/json` (which forces a CORS preflight) doesn't
 * hold: a cross-origin fetch with `content-type: text/plain` is a "simple
 * request" that sends no preflight, and the fetch adapter parses the body
 * regardless of what the content type claims.
 *
 * Kept as a pure function of (origin, method) so the allowlist logic is
 * unit-testable without constructing a Request or touching process.env.
 */

/**
 * Origins this deployment answers mutations for. Comparing Origin against
 * the request's own Host header instead would be pointless — on Vercel the
 * platform rewrites Host to the deployment's value, so that check passes for
 * every origin. It has to be an explicit list.
 *
 * NEXT_PUBLIC_SITE_URL is the one that matters in production: with
 * Cloudflare in front of a custom domain (docs/design-plan.md §2), the
 * browser's Origin is that custom domain, which neither VERCEL_* var knows
 * about. The VERCEL_* vars are set by the platform and cover preview deploys,
 * whose hostname changes per build.
 */
type OriginEnv = Record<string, string | undefined>

export function allowedOrigins(env: OriginEnv = process.env): string[] {
  return [
    env.NEXT_PUBLIC_SITE_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`,
    env.VERCEL_URL && `https://${env.VERCEL_URL}`,
    !env.VERCEL ? 'http://localhost:3000' : undefined,
  ].filter((value): value is string => Boolean(value))
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

export function isRequestOriginAllowed(
  origin: string | null,
  method: string,
  origins: string[] = allowedOrigins()
): boolean {
  // No Origin header means a non-browser caller (curl, a health check, a
  // server-side prefetch). Allowed for GET, which only reaches read-only
  // queries; a mutation without an Origin is refused rather than trusted.
  if (!origin) return method === 'GET'

  const requestHost = hostOf(origin)
  if (!requestHost) return false

  return origins.some((allowed) => hostOf(allowed) === requestHost)
}
