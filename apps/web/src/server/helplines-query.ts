import type { Helpline } from '@/shared/schemas'

/**
 * Area filtering happens here in plain JS rather than a Postgrest `.or()`
 * filter string (design-plan.md Milestone 9): `helplines` is small,
 * static-ish data (scope.md §7), so there's no query-performance reason to
 * push this into SQL, and it avoids building a raw filter string out of
 * user-supplied text. NULL `area` means citywide (supabase/migrations/0001_core_schema.sql),
 * so those rows always match regardless of the requested area.
 */
export function filterHelplinesByArea(helplines: Helpline[], area?: string): Helpline[] {
  if (!area) return helplines
  return helplines.filter((helpline) => helpline.area === null || helpline.area === area)
}
