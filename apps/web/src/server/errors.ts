import 'server-only'
import { TRPCError } from '@trpc/server'
import * as Sentry from '@sentry/nextjs'

/**
 * Turns a Postgres/PostgREST error into a client-safe TRPCError.
 *
 * Every router used to do `message: error.message`, which hands the caller
 * whatever Postgres said — constraint names, column names, function
 * signatures, occasionally row values from a uniqueness violation. That's
 * free schema reconnaissance for anyone poking at the public procedures. The
 * real message goes to Sentry, where it's actually useful; the caller gets a
 * fixed string.
 */
export function internalError(context: string, error: { message: string }): TRPCError {
  Sentry.captureException(new Error(`${context}: ${error.message}`))

  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Something went wrong on our end. Please try again.',
  })
}
