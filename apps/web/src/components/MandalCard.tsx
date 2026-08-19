import Image from 'next/image'
import Link from 'next/link'
import { ModakIcon } from '@/components/ModakIcon'
import { mandalGradient } from '@/lib/mandal-gradient'
import type { Mandal } from '@/shared/schemas'

export function MandalCard({ mandal }: { mandal: Mandal }) {
  return (
    <Link
      href={`/mandal/${mandal.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
    >
      <div
        className="relative flex aspect-4/3 w-full items-center justify-center"
        style={mandal.photo_url ? undefined : { background: mandalGradient(mandal.id) }}
      >
        {mandal.photo_url ? (
          // next/image remotePatterns for the Supabase storage domain still need
          // configuring in next.config.ts once a real project exists (Milestone 1).
          <Image
            src={mandal.photo_url}
            alt={mandal.name}
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 100vw"
          />
        ) : (
          <ModakIcon detailed className="h-[46%] w-[46%] text-white/90 opacity-30" />
        )}

        {mandal.verification_status === 'verified' && (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-good">
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Verified
          </span>
        )}
        {mandal.established_year && (
          <span className="absolute right-2.5 bottom-2.5 rounded-full bg-ink/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-xs">
            est. {mandal.established_year}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="leading-tight font-bold">{mandal.name}</h3>
        <p className="flex items-center gap-1.5 text-sm text-ink-soft">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="flex-none text-accent"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {mandal.area}
        </p>

        {mandal.tags && mandal.tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5">
            {mandal.tags.map((tag) => (
              <span
                key={tag}
                className={`rounded-md px-2.5 py-0.5 text-xs font-bold ${
                  tag === 'eco-friendly'
                    ? 'bg-good-tint text-good'
                    : 'bg-accent-tint text-accent-deep'
                }`}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {mandal.nearest_station && (
          <p className="mt-1 flex items-center gap-1.5 border-t border-line-soft pt-2.5 text-xs font-semibold text-ink-faint">
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <rect x="4" y="3" width="16" height="14" rx="2" />
              <path d="M8 21h8M9 17v4M15 17v4" strokeLinecap="round" />
            </svg>
            Nearest: {mandal.nearest_station}
          </p>
        )}
      </div>
    </Link>
  )
}
