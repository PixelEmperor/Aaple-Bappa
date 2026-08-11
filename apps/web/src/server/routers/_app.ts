import { router } from '../trpc'
import { mandalsRouter } from './mandals'

export const appRouter = router({
  mandals: mandalsRouter,
})

export type AppRouter = typeof appRouter
