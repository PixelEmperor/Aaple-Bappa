import type { Metadata } from 'next'
import { Suspense } from 'react'
import { MapView } from '@/components/MapView'

export const metadata: Metadata = {
  title: 'Map · Aaple Bappa',
}

export default function MapPage() {
  return (
    // useSearchParams() inside MapView requires a Suspense boundary in the
    // App Router (same reasoning as the directory page).
    <Suspense fallback={null}>
      <MapView />
    </Suspense>
  )
}
