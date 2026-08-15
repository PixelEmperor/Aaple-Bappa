import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import MandalMiniMap from '@/components/MandalMiniMapIsland'
import { getAllMandalSlugs, getMandalBySlug } from '@/lib/mandals-data'

// ISR (design-plan.md Milestone 6). generateStaticParams pre-builds every
// currently-published mandal at build time; revalidate keeps them fresh
// without a full rebuild.
export const revalidate = 3600

export async function generateStaticParams() {
  const slugs = await getAllMandalSlugs()
  return slugs.map((slug) => ({ slug }))
}

async function loadMandal(slug: string) {
  try {
    return await getMandalBySlug(slug)
  } catch (error) {
    // NOT_FOUND means an unknown/unpublished slug — a real 404, not a bug.
    // Anything else (e.g. Supabase unreachable) should surface as a real
    // error rather than being misreported as "this mandal doesn't exist".
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
      return null
    }
    throw error
  }
}

export async function generateMetadata({ params }: PageProps<'/mandal/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const mandal = await loadMandal(slug)
  if (!mandal) return {}

  const description = mandal.description ?? `${mandal.name} — ${mandal.area}, Mumbai.`

  return {
    title: `${mandal.name} · Aaple Bappa`,
    description,
    openGraph: {
      title: mandal.name,
      description,
      images: mandal.photo_url ? [mandal.photo_url] : undefined,
    },
  }
}

export default async function MandalDetailPage({ params }: PageProps<'/mandal/[slug]'>) {
  const { slug } = await params
  const mandal = await loadMandal(slug)
  if (!mandal) notFound()

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
        {mandal.photo_url ? (
          <Image src={mandal.photo_url} alt={mandal.name} fill className="object-cover" priority />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            No photo yet
          </div>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-bold">{mandal.name}</h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          {mandal.area}
          {mandal.zone ? ` · ${mandal.zone}` : ''}
        </p>
      </div>

      {mandal.tags && mandal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
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

      {mandal.description && (
        <p className="text-zinc-700 dark:text-zinc-300">{mandal.description}</p>
      )}

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {mandal.established_year && (
          <div>
            <dt className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              Established
            </dt>
            <dd>{mandal.established_year}</dd>
          </div>
        )}
        {mandal.timings && (
          <div>
            <dt className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Timings</dt>
            <dd>{mandal.timings}</dd>
          </div>
        )}
        {mandal.nearest_station && (
          <div>
            <dt className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              Nearest station
            </dt>
            <dd>{mandal.nearest_station}</dd>
          </div>
        )}
        {mandal.official_contact && (
          <div>
            <dt className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Contact</dt>
            <dd>{mandal.official_contact}</dd>
          </div>
        )}
      </dl>

      {mandal.history && (
        <div>
          <h2 className="mb-1 text-lg font-semibold">History</h2>
          <p className="text-zinc-600 dark:text-zinc-300">{mandal.history}</p>
        </div>
      )}

      <div className="h-64 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <MandalMiniMap lat={mandal.lat} lng={mandal.lng} />
      </div>
    </main>
  )
}
