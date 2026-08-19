'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

const inputClass =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:ring-3 focus:ring-accent-tint focus:outline-none'

export function AdminLoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setIsSubmitting(false)
    if (error) {
      setErrorMessage(error.message)
      return
    }

    // refresh() re-runs the admin layout's server-side moderator check
    // (src/app/admin/(dashboard)/layout.tsx) against the now-signed-in
    // session, rather than navigating with a stale, logged-out RSC payload.
    router.push('/admin')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          autoComplete="username"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Password</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          autoComplete="current-password"
        />
      </label>
      {errorMessage && (
        <p role="alert" className="text-sm text-crit">
          {errorMessage}
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-deep disabled:opacity-50"
      >
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
