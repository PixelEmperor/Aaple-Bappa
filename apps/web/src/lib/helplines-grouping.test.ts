import { describe, expect, it } from 'vitest'
import { groupHelplinesByCategory } from './helplines-grouping'
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

describe('groupHelplinesByCategory', () => {
  it('returns an empty object for an empty list', () => {
    expect(groupHelplinesByCategory([])).toEqual({})
  })

  it('groups helplines under their category', () => {
    const police = helpline({ category: 'police' })
    const medical = helpline({ category: 'medical', phone: '108' })

    expect(groupHelplinesByCategory([police, medical])).toEqual({
      police: [police],
      medical: [medical],
    })
  })

  it('preserves order within a category and across multiple entries', () => {
    const first = helpline({ category: 'traffic', area: 'Lalbaug' })
    const second = helpline({ category: 'traffic', area: 'Andheri' })

    expect(groupHelplinesByCategory([first, second])).toEqual({
      traffic: [first, second],
    })
  })
})
