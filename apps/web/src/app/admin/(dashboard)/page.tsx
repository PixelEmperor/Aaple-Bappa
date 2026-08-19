import type { Metadata } from 'next'
import { ModerationQueue } from '@/components/ModerationQueue'

export const metadata: Metadata = {
  title: 'Moderation queue · Aaple Bappa',
}

export default function AdminPage() {
  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6"
    >
      <h1 className="text-2xl font-bold">Moderation queue</h1>
      <ModerationQueue />
    </main>
  )
}
