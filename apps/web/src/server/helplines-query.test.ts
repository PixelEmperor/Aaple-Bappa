import { describe, expect, it } from 'vitest'
import { filterHelplinesByArea } from './helplines-query'
import type { Helpline } from '@/shared/schemas'

function helpline(overrides: Partial<Helpline>): Helpline {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    category: 'police',
    area: null,
    phone: '100',
    notes: null,
    ...overrides,
  }
}

describe('filterHelplinesByArea', () => {
  it('returns everything when no area is given', () => {
    const helplines = [helpline({ area: null }), helpline({ area: 'Lalbaug' })]
    expect(filterHelplinesByArea(helplines, undefined)).toEqual(helplines)
  })

  it('keeps citywide rows and rows matching the given area', () => {
    const citywide = helpline({ area: null })
    const matching = helpline({ area: 'Lalbaug' })
    const other = helpline({ area: 'Andheri' })

    expect(filterHelplinesByArea([citywide, matching, other], 'Lalbaug')).toEqual([
      citywide,
      matching,
    ])
  })

  it('excludes area-scoped rows for a different area', () => {
    const other = helpline({ area: 'Andheri' })
    expect(filterHelplinesByArea([other], 'Lalbaug')).toEqual([])
  })
})
