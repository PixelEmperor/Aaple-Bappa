'use client'

import dynamic from 'next/dynamic'

// Leaflet touches `window` at module load time, which crashes during Next's
// server render — ssr: false is load-bearing (same reasoning as MapView.tsx).
// This wrapper exists because next/dynamic(..., { ssr: false }) isn't allowed
// directly inside a Server Component; the mandal detail page (async Server
// Component, for SSR/ISR of the core content) renders this Client Component
// instead, which is where the dynamic import itself is allowed to live.
const MandalMiniMap = dynamic(() => import('./MandalMiniMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-ink-faint">
      Loading map…
    </div>
  ),
})

export default MandalMiniMap
