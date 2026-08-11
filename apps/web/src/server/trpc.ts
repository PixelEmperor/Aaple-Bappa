import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { z, ZodError } from 'zod'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role'
import type { Context } from './context'

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? z.treeifyError(error.cause) : null,
      },
    }
  },
})

export const router = t.router
export const publicProcedure = t.procedure

/**
 * Session + `moderators` row check (design-plan.md §1/§9): the moderators-table
 * lookup uses the service-role client since `moderators` has no RLS policies
 * for anon/authenticated (supabase/migrations/0003_rls.sql) — this check *is*
 * the authorization boundary, kept in this one auditable place rather than at
 * the DB layer.
 */
export const moderatorProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }

  const serviceRole = createSupabaseServiceRoleClient()
  const { data: moderator } = await serviceRole
    .from('moderators')
    .select('id')
    .eq('user_id', ctx.user.id)
    .maybeSingle()

  if (!moderator) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }

  return next({ ctx: { ...ctx, user: ctx.user } })
})
