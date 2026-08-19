'use client'

import * as Sentry from '@sentry/nextjs'
import NextError from 'next/error'
import { useEffect } from 'react'

/**
 * Root error boundary (design-plan.md Milestone 10): only place that catches
 * errors thrown above the normal React tree (e.g. in layout.tsx itself), so
 * Sentry.captureException runs here rather than relying on route-level
 * boundaries alone.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  )
}
