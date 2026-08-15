import type { Metadata } from 'next'
import { SubmitForm } from '@/components/SubmitForm'

export const metadata: Metadata = {
  title: 'Add a mandal · Aaple Bappa',
}

export default function SubmitPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold">Add a mandal</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Know a Ganpati mandal? Add it here — a volunteer reviews every entry before it goes live.
        </p>
      </div>
      <SubmitForm />
    </main>
  )
}
