import { router } from '../trpc'
import { helplinesRouter } from './helplines'
import { mandalsRouter } from './mandals'
import { submissionsRouter } from './submissions'

export const appRouter = router({
  mandals: mandalsRouter,
  submissions: submissionsRouter,
  helplines: helplinesRouter,
})

export type AppRouter = typeof appRouter
