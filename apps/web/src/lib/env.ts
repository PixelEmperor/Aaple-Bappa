/**
 * Throws with a clear message instead of silently constructing a client
 * with `undefined`/empty credentials — until a real Supabase project is
 * configured (design-plan.md Milestone 1), this is the expected failure
 * mode, not a "can't happen" case.
 */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env.local and fill it in.`
    )
  }
  return value
}
