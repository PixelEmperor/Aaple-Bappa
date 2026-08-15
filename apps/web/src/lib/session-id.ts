const STORAGE_KEY = 'aapleBappaSessionId'

/**
 * Anonymous, client-generated identifier for rate-limiting only (scope.md
 * §4's crowd_reports.reporter_session_id pattern, reused here for
 * submissions.create) — no PII, just a random id persisted in localStorage.
 */
export function getOrCreateSessionId(): string {
  const existing = window.localStorage.getItem(STORAGE_KEY)
  if (existing) return existing

  const created = crypto.randomUUID()
  window.localStorage.setItem(STORAGE_KEY, created)
  return created
}
