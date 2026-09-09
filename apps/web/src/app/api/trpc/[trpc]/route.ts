import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { createContext } from '@/server/context'
import { appRouter } from '@/server/routers/_app'
import { isRequestOriginAllowed } from '@/server/same-origin'

function handler(req: Request) {
  // CSRF: see src/server/same-origin.ts for why the JSON content-type alone
  // isn't the protection it's often assumed to be.
  if (!isRequestOriginAllowed(req.headers.get('origin'), req.method)) {
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
