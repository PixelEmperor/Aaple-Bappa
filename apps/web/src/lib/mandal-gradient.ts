/**
 * Deterministic placeholder gradient for a mandal card's thumbnail when it
 * has no photo yet (docs/ui-mockup.html's .v1–.v6 variants) — same mandal
 * always gets the same gradient, rather than a random one that shifts on
 * every render/refetch.
 */
const GRADIENTS = [
  'linear-gradient(135deg, #E8820C, #B23A0E)',
  'linear-gradient(135deg, #B0344A, #6E1E3C)',
  'linear-gradient(135deg, #C98A00, #8A5A00)',
  'linear-gradient(135deg, #C2410C, #7A2410)',
  'linear-gradient(135deg, #A23E6E, #5E2450)',
  'linear-gradient(135deg, #D4880E, #9E3A12)',
]

export function mandalGradient(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}
