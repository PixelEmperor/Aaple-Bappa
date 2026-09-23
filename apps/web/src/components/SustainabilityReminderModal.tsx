'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

const DISMISSED_KEY = 'sustainability-reminder-dismissed'

/**
 * Shows once per browser (localStorage-gated) on first load, reminding
 * visitors to keep their Ganpati celebrations eco-friendly.
 */
export function SustainabilityReminderModal() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(DISMISSED_KEY)) setIsOpen(true)
    } catch {
      // Private browsing / storage disabled — show it anyway, just not "once".
      setIsOpen(true)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  function close() {
    setIsOpen(false)
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Ignore — worst case the reminder reappears next visit.
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sustainability reminder"
      onClick={close}
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-paper shadow-xl"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute top-2 right-2 z-10 grid size-8 place-items-center rounded-full bg-black/40 text-xl leading-none text-white hover:bg-black/60"
        >
          ×
        </button>
        <div className="relative w-full">
          <Image
            src="/ciu-sustainability-flyer.jpeg"
            alt="Celebrate an eco-friendly Ganpati"
            width={1000}
            height={1000}
            className="h-auto max-h-[60vh] w-full object-contain"
            priority
          />
        </div>
        <div className="space-y-2 p-4 text-center">
          <p className="font-medium text-ink">
            This Ganpati, let&apos;s worship Bappa sustainably 🙏
          </p>
          <p className="text-sm text-ink/70">
            Choose eco-friendly idols, avoid plastic decor, and immerse responsibly.
          </p>
          <button
            type="button"
            onClick={close}
            className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
