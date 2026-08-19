import type { Helpline, HelplineCategory } from '@/shared/schemas'

/** Groups a flat helplines list by category for the /helplines page (design-plan.md Milestone 9). */
export function groupHelplinesByCategory(
  helplines: Helpline[]
): Partial<Record<HelplineCategory, Helpline[]>> {
  const grouped: Partial<Record<HelplineCategory, Helpline[]>> = {}

  for (const helpline of helplines) {
    const bucket = grouped[helpline.category]
    if (bucket) {
      bucket.push(helpline)
    } else {
      grouped[helpline.category] = [helpline]
    }
  }

  return grouped
}
