import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { createContext } from '@/server/context'
import { appRouter } from '@/server/routers/_app'
import { isRequestAllowed } from '@/server/same-origin'

/**
 * submissions.bulkReview walks its batch sequentially, a few DB round trips
 * per item (src/server/routers/submissions.ts), so a full chunk takes tens of
 * seconds' worth of latency in the worst case. Without this the platform
 * default (10s on Vercel Hobby) applied, and a batch that timed out midway
 * left the already-committed approvals reported to the moderator as failures
 * — each item's RPC is its own transaction, so the writes stuck but the
 * response was lost.
 */
export const maxDuration = 60

function handler(req: Request) {
  // CSRF: see src/server/same-origin.ts for why the JSON content-type alone
  // isn't the protection it's often assumed to be, and why Sec-Fetch-Site is
  // the primary signal rather than the Origin allowlist.
  const allowed = isRequestAllowed({
    origin: req.headers.get('origin'),
    secFetchSite: req.headers.get('sec-fetch-site'),
    method: req.method,
  })

  if (!allowed) {
    return Response.json({ error: 'Cross-site request blocked' }, { status: 403 })
  }

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext,
  })
}

export { handler as GET, handler as POST }
