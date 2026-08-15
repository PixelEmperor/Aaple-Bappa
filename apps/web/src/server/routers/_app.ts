import { router } from '../trpc'
import { mandalsRouter } from './mandals'
import { submissionsRouter } from './submissions'

export const appRouter = router({
  mandals: mandalsRouter,
  submissions: submissionsRouter,
})

export type AppRouter = typeof appRouter
