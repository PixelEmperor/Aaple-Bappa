'use client'

import dynamic from 'next/dynamic'
import type { PinLocation } from './MandalPinPicker'

export type { PinLocation }

// Same reasoning as MandalMiniMapIsland.tsx / MapView.tsx: Leaflet touches
// `window` at import time, and next/dynamic(..., { ssr: false }) isn't
// allowed directly inside a Server Component.
const MandalPinPicker = dynamic(() => import('./MandalPinPicker'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
      Loading map…
    </div>
  ),
})

export default MandalPinPicker
