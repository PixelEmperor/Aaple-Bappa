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
    // Off-platform dev only. Also gated on NODE_ENV so a self-hosted
    // production deploy (no VERCEL var set) doesn't ship localhost in its
    // own CSRF allowlist.
    !env.VERCEL && env.NODE_ENV !== 'production' ? 'http://localhost:3000' : undefined,
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

/**
 * The check the route handler actually calls.
 *
 * `Sec-Fetch-Site` is the primary signal and the Origin allowlist is the
 * fallback, rather than the other way round, because the allowlist depends
 * on deployment configuration and the header doesn't. With the app behind
 * Cloudflare on a custom domain, the browser's Origin is that domain, which
 * neither VERCEL_* var knows — so an unset NEXT_PUBLIC_SITE_URL used to mean
 * the allowlist matched nothing and *every* mutation 403'd in production,
 * with no failure until real traffic hit it. Keying off Sec-Fetch-Site
 * removes that footgun: it's set by the browser, is not settable by page
 * script (a forbidden header name), and needs no configuration to be right.
 *
 * - `same-origin` — the app's own pages calling their own API. Allow.
 * - `none` — a user-initiated load (typed URL, bookmark). No initiating
 *   site, so no cross-site attacker. Allow.
 * - `cross-site` — exactly the CSRF case this guards. Refuse.
 * - `same-site` — a sibling subdomain, which is not necessarily trusted;
 *   falls through to the explicit allowlist rather than being waved through.
 * - absent — a non-browser client, or a browser too old to send it. Falls
 *   through to the previous Origin-allowlist behaviour.
 */
export function isRequestAllowed(
  request: { origin: string | null; secFetchSite: string | null; method: string },
  origins: string[] = allowedOrigins()
): boolean {
  const { origin, secFetchSite, method } = request

  if (secFetchSite === 'same-origin' || secFetchSite === 'none') return true
  if (secFetchSite === 'cross-site') return false

  return isRequestOriginAllowed(origin, method, origins)
}
