import { TRPCError } from '@trpc/server'
import {
  mandalSchema,
  mandalsGetBySlugInputSchema,
  mandalsListInputSchema,
  mandalsListOutputSchema,
} from '@/shared/schemas'
import { buildMandalFilters, paginationRange } from '../mandals-query'
import { publicProcedure, router } from '../trpc'

export const mandalsRouter = router({
  /** Public, powers the directory and map (design-plan.md Milestone 3/4/5). */
  list: publicProcedure
    .input(mandalsListInputSchema)
    .output(mandalsListOutputSchema)
    .query(async ({ ctx, input }) => {
      const { from, to } = paginationRange(input.page, input.pageSize)

      let query = ctx.supabase.from('mandals').select('*', { count: 'exact' })

      for (const filter of buildMandalFilters(input)) {
        switch (filter.type) {
          case 'ilike':
            query = query.ilike(filter.column, filter.value)
            break
          case 'eq':
            query = query.eq(filter.column, filter.value)
            break
          case 'contains':
            query = query.contains(filter.column, filter.value)
            break
        }
      }

      const { data, count, error } = await query.order('name', { ascending: true }).range(from, to)

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return {
        items: data ?? [],
        total: count ?? 0,
        page: input.page,
      }
    }),

  /** Public, powers the detail page. NOT_FOUND drives the 404 (design-plan.md Milestone 6). */
  getBySlug: publicProcedure
    .input(mandalsGetBySlugInputSchema)
    .output(mandalSchema)
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('mandals')
        .select('*')
        .eq('slug', input.slug)
        .maybeSingle()

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }
      if (!data) {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }

      return data
    }),
})
