'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { ModakIcon } from '@/components/ModakIcon'
import { mandalGradient } from '@/lib/mandal-gradient'

type MandalPhotoBannerProps = {
  mandalId: string
  name: string
  photoUrl: string | null
}

/**
 * The detail page's hero photo, click-to-expand into a full-size lightbox.
 * `aspect-21/8` (the banner's usual shape) crops most photos significantly —
 * this is the only way to actually see one uncropped.
 */
export function MandalPhotoBanner({ mandalId, name, photoUrl }: MandalPhotoBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    if (!isExpanded) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsExpanded(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isExpanded])

  return (
    <>
      <div
        role={photoUrl ? 'button' : undefined}
        tabIndex={photoUrl ? 0 : undefined}
        onClick={photoUrl ? () => setIsExpanded(true) : undefined}
        onKeyDown={
          photoUrl
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setIsExpanded(true)
                }
              }
            : undefined
        }
        aria-label={photoUrl ? `View full-size photo of ${name}` : undefined}
        className={`relative flex aspect-21/8 w-full items-center justify-center overflow-hidden rounded-xl shadow-md ${
          photoUrl ? 'cursor-zoom-in' : ''
        }`}
        style={photoUrl ? undefined : { background: mandalGradient(mandalId) }}
      >
        {photoUrl ? (
          <Image src={photoUrl} alt={name} fill className="object-cover" priority />
        ) : (
          <ModakIcon detailed className="h-30 w-30 text-white/90 opacity-30" />
        )}
      </div>

      {isExpanded && photoUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${name} — full-size photo`}
          onClick={() => setIsExpanded(false)}
          // Leaflet's own controls/panes sit as high as z-index 1000
          // (.leaflet-top/.leaflet-bottom in its own CSS), so the mini-map
          // was rendering on top of a z-50 overlay instead of underneath it.
          className="fixed inset-0 z-[2000] flex cursor-zoom-out items-center justify-center bg-black/90 p-4"
        >
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            aria-label="Close"
            className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-white/10 text-2xl leading-none text-white hover:bg-white/20"
          >
            ×
          </button>
          {/* Plain img, not next/image: the point here is the original
              resolution at whatever size fits the viewport, not a
              size-constrained optimized variant. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- full-res lightbox view, not a fixed-size optimized thumbnail */}
          <img
            src={photoUrl}
            alt={name}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
