import { helplinesListInputSchema, helplinesListOutputSchema } from '@/shared/schemas'
import { internalError } from '../errors'
import { filterHelplinesByArea } from '../helplines-query'
import { publicProcedure, router } from '../trpc'

export const helplinesRouter = router({
  /** Public, powers /helplines (design-plan.md Milestone 9). */
  list: publicProcedure
    .input(helplinesListInputSchema)
    .output(helplinesListOutputSchema)
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('helplines')
        .select('*')
        .order('category', { ascending: true })

      if (error) {
        throw internalError('helplines.list', error)
      }

      return filterHelplinesByArea(data ?? [], input.area)
    }),
})
