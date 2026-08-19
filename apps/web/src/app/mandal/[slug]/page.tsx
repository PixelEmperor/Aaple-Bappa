import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import MandalMiniMap from '@/components/MandalMiniMapIsland'
import { ModakIcon } from '@/components/ModakIcon'
import { getAllMandalSlugs, getMandalBySlug } from '@/lib/mandals-data'
import { mandalGradient } from '@/lib/mandal-gradient'

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
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6"
    >
      <div
        className="relative flex aspect-21/8 w-full items-center justify-center overflow-hidden rounded-xl shadow-md"
        style={mandal.photo_url ? undefined : { background: mandalGradient(mandal.id) }}
      >
        {mandal.photo_url ? (
          <Image src={mandal.photo_url} alt={mandal.name} fill className="object-cover" priority />
        ) : (
          <ModakIcon detailed className="h-30 w-30 text-white/90 opacity-30" />
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">{mandal.name}</h1>
            <p className="mt-2 flex items-center gap-2 font-semibold text-ink-soft">
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="flex-none text-accent"
              >
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {mandal.area}
              {mandal.zone ? ` · ${mandal.zone}` : ''}
            </p>
          </div>

          {mandal.tags && mandal.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
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

          {mandal.description && (
            <div>
              <p className="mb-1 text-xs font-bold tracking-widest text-ink-faint uppercase">
                About
              </p>
              <p className="max-w-prose text-ink-soft">{mandal.description}</p>
            </div>
          )}

          {mandal.history && (
            <div>
              <p className="mb-1 text-xs font-bold tracking-widest text-ink-faint uppercase">
                History
              </p>
              <p className="max-w-prose text-ink-soft">{mandal.history}</p>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <dl className="divide-y divide-line-soft rounded-lg border border-line bg-surface px-4 shadow-sm">
            {mandal.timings && <Fact label="Timings">{mandal.timings}</Fact>}
            {mandal.nearest_station && (
              <Fact label="Nearest station">{mandal.nearest_station}</Fact>
            )}
            {mandal.established_year && <Fact label="Established">{mandal.established_year}</Fact>}
            {mandal.official_contact && <Fact label="Contact">{mandal.official_contact}</Fact>}
          </dl>

          <div className="aspect-4/3 overflow-hidden rounded-lg border border-line">
            <MandalMiniMap lat={mandal.lat} lng={mandal.lng} />
          </div>
        </aside>
      </div>
    </main>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 first:pt-4 last:pb-4">
      <dt className="text-xs font-bold tracking-wide text-ink-faint uppercase">{label}</dt>
      <dd className="font-semibold text-ink">{children}</dd>
    </div>
  )
}
