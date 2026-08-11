/**
 * Slug generation (design-plan.md Milestone 1): slugify(name); on collision
 * append -{area-slug}, then -2, -3. Generated at write time (seeding +
 * approval), never at read time, so this stays a pure function — the
 * caller supplies whatever slugs already exist from a real query.
 */

const COMBINING_MARKS = /[\u0300-\u036f]/g // combining marks left by NFKD normalization

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function generateSlug(
  name: string,
  area: string,
  existingSlugs: ReadonlySet<string>
): string {
  const base = slugify(name)
  if (!existingSlugs.has(base)) return base

  const withArea = `${base}-${slugify(area)}`
  if (!existingSlugs.has(withArea)) return withArea

  let suffix = 2
  while (existingSlugs.has(`${withArea}-${suffix}`)) {
    suffix += 1
  }
  return `${withArea}-${suffix}`
}
