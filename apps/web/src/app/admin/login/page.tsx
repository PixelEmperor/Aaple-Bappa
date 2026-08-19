import type { Metadata } from 'next'
import { AdminLoginForm } from '@/components/AdminLoginForm'

export const metadata: Metadata = {
  title: 'Moderator login · Aaple Bappa',
}

export default function AdminLoginPage() {
  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-8"
    >
      <div>
        <h1 className="text-2xl font-bold">Moderator login</h1>
        <p className="mt-1 text-sm text-ink-soft">Aaple Bappa moderation admin.</p>
      </div>
      <AdminLoginForm />
    </main>
  )
}
