import { TRPCError } from '@trpc/server'
import { helplinesListInputSchema, helplinesListOutputSchema } from '@/shared/schemas'
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
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return filterHelplinesByArea(data ?? [], input.area)
    }),
})
