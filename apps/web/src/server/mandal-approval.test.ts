import { describe, expect, it } from 'vitest'
import {
  buildMandalEditPatch,
  buildNewMandalInsert,
  formatAuditTrail,
  storedNewMandalPayloadSchema,
} from './mandal-approval'

const VALID_PAYLOAD = {
  name: 'Lalbaugcha Raja',
  area: 'Lalbaug',
  lat: 18.9998,
  lng: 72.833,
  established_year: 1934,
  timings: '6 AM – 11 PM',
  nearest_station: 'Parel',
  description: null,
  tags: ['tallest'],
  official_contact: null,
  is_public: true,
  photo_url: 'https://example.com/photo.jpg',
}

describe('storedNewMandalPayloadSchema', () => {
  it('accepts the shape submissions.create writes', () => {
    expect(storedNewMandalPayloadSchema.parse(VALID_PAYLOAD)).toEqual(VALID_PAYLOAD)
  })

  it('rejects a payload missing required fields', () => {
    const rest: Record<string, unknown> = { ...VALID_PAYLOAD }
    delete rest.name
    expect(() => storedNewMandalPayloadSchema.parse(rest)).toThrow()
  })
})

describe('buildNewMandalInsert', () => {
  it('generates a slug and passes the payload through otherwise unchanged', () => {
    const result = buildNewMandalInsert(VALID_PAYLOAD, new Set())
    expect(result).toEqual({ ...VALID_PAYLOAD, slug: 'lalbaugcha-raja' })
  })

  it('disambiguates the slug against existing slugs', () => {
    const result = buildNewMandalInsert(VALID_PAYLOAD, new Set(['lalbaugcha-raja']))
    expect(result.slug).toBe('lalbaugcha-raja-lalbaug')
  })

  it('throws on a malformed payload rather than silently writing partial data', () => {
    expect(() => buildNewMandalInsert({ name: 'Only a name' }, new Set())).toThrow()
  })
})

describe('buildMandalEditPatch', () => {
  it('picks only known mandal columns present in the payload', () => {
    expect(
      buildMandalEditPatch({ name: 'New Name', timings: '7 AM – 10 PM', not_a_column: 'ignored' })
    ).toEqual({ name: 'New Name', timings: '7 AM – 10 PM' })
  })

  it('omits columns absent from the payload rather than nulling them', () => {
    expect(buildMandalEditPatch({ name: 'New Name' })).toEqual({ name: 'New Name' })
  })

  it('returns an empty patch for a non-object payload', () => {
    expect(buildMandalEditPatch(null)).toEqual({})
    expect(buildMandalEditPatch('not an object')).toEqual({})
  })
})

describe('formatAuditTrail', () => {
  it('records only the prior values of patched columns', () => {
    const trail = formatAuditTrail(
      { name: 'Old Name', timings: 'Old timings', area: 'Untouched' },
      { name: 'New Name' }
    )
    expect(trail).toBe('[prior values overwritten: {"name":"Old Name"}]')
  })

  it('appends the audit trail after the moderator’s own notes', () => {
    const trail = formatAuditTrail({ name: 'Old Name' }, { name: 'New Name' }, 'Looks legit')
    expect(trail).toBe('Looks legit\n\n[prior values overwritten: {"name":"Old Name"}]')
  })
})
