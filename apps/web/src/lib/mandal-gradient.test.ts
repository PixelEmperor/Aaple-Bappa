import { describe, expect, it } from 'vitest'
import { mandalGradient } from './mandal-gradient'

describe('mandalGradient', () => {
  it('is deterministic for the same id', () => {
    const id = '11111111-1111-1111-1111-111111111111'
    expect(mandalGradient(id)).toBe(mandalGradient(id))
  })

  it('returns a linear-gradient value', () => {
    expect(mandalGradient('some-id')).toMatch(/^linear-gradient\(/)
  })
})
