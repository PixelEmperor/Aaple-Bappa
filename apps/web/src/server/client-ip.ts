import 'server-only'
import { headers } from 'next/headers'

/**
 * Resolves the caller's IP for rate-limiting keys.
 *
 * The obvious version of this — `x-forwarded-for.split(',')[0]` — is
 * spoofable, and was: this app runs on Vercel behind Cloudflare
 * (docs/design-plan.md §2), and a proxy *appends* to X-Forwarded-For rather
 * than replacing it. A request arriving with its own `X-Forwarded-For: 1.2.3.4`
 * header reaches the app as `1.2.3.4, <real client ip>`, so reading the
 * first entry reads whatever the client typed — a fresh value per request
 * defeats the IP rate limit entirely, and a victim's address burns their
 * quota for them.
 *
 * So: prefer the single-value headers the edge sets itself and that a client
 * can't forge (Cloudflare and Vercel both overwrite theirs), and only fall
 * back to X-Forwarded-For — from the right end, the last hop appended by the
 * closest trusted proxy.
 *
 * Ordering note, and the reason it isn't alphabetical: `x-real-ip` comes
 * first because Vercel — the host that actually terminates this request —
 * always overwrites it, so a client-supplied value never survives. Reading
 * `cf-connecting-ip` first was wrong: Cloudflare only sets that header when
 * the request genuinely passes through Cloudflare, and the Vercel deployment
 * URL stays directly reachable, so an attacker could POST straight to
 * *.vercel.app with a `cf-connecting-ip` of their choosing and get a fresh
 * rate-limit bucket per request. It's kept only as a fallback for the case
 * where Vercel's own header is somehow absent, since a forged value there is
 * no worse than the 'unknown' it would otherwise fall through to.
 */
export async function clientIp(): Promise<string> {
  const headerList = await headers()

  const trusted = headerList.get('x-real-ip') ?? headerList.get('cf-connecting-ip')
  if (trusted) return trusted.trim()

  // Vercel's own copy of the chain; its last entry is the peer Vercel saw.
  const forwardedFor = headerList.get('x-vercel-forwarded-for') ?? headerList.get('x-forwarded-for')
  if (forwardedFor) {
    const hops = forwardedFor
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1]
  }

  return 'unknown'
}
