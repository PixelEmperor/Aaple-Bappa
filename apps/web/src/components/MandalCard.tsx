import Image from 'next/image'
import Link from 'next/link'
import type { Mandal } from '@/shared/schemas'

export function MandalCard({ mandal }: { mandal: Mandal }) {
  return (
    <Link
      href={`/mandal/${mandal.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-zinc-200 transition-shadow hover:shadow-md dark:border-zinc-800"
    >
      <div className="relative aspect-4/3 w-full bg-zinc-100 dark:bg-zinc-800">
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
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            No photo yet
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="leading-tight font-semibold">{mandal.name}</h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{mandal.area}</p>
        {mandal.tags && mandal.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {mandal.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800 dark:bg-orange-950 dark:text-orange-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
