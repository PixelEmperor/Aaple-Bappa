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
    ).toEqual({ patch: { name: 'New Name', timings: '7 AM – 10 PM' }, dropped: [] })
  })

  it('omits columns absent from the payload rather than nulling them', () => {
    expect(buildMandalEditPatch({ name: 'New Name' })).toEqual({
      patch: { name: 'New Name' },
      dropped: [],
    })
  })

  it('returns an empty patch for a non-object payload', () => {
    expect(buildMandalEditPatch(null)).toEqual({ patch: {}, dropped: [] })
    expect(buildMandalEditPatch('not an object')).toEqual({ patch: {}, dropped: [] })
  })

  /**
   * An edit submission's payload is submitter-controlled, so whitelisting
   * the column *names* isn't enough on its own — these are the values that
   * used to sail through untouched and get merged into a live public row.
   */
  it('drops a javascript: photo_url rather than merging a stored-XSS payload', () => {
    expect(buildMandalEditPatch({ photo_url: 'javascript:alert(document.cookie)' })).toEqual({
      patch: {},
      dropped: ['photo_url'],
    })
  })

  it('drops a non-https photo_url', () => {
    expect(buildMandalEditPatch({ photo_url: 'http://example.com/p.jpg' }).dropped).toEqual([
      'photo_url',
    ])
    expect(buildMandalEditPatch({ photo_url: 'data:image/svg+xml,<svg/>' }).dropped).toEqual([
      'photo_url',
    ])
  })

  it('drops an over-long name', () => {
    expect(buildMandalEditPatch({ name: 'x'.repeat(5000) }).dropped).toEqual(['name'])
  })

  it('drops tags outside the predefined list', () => {
    expect(buildMandalEditPatch({ tags: ['eco-friendly', 'made-up'] }).dropped).toEqual(['tags'])
    expect(buildMandalEditPatch({ tags: ['eco-friendly'] }).patch).toEqual({
      tags: ['eco-friendly'],
    })
  })

  it('drops out-of-range coordinates and a bogus zone', () => {
    expect(buildMandalEditPatch({ lat: 999, lng: -1000 }).dropped).toEqual(['lat', 'lng'])
    expect(buildMandalEditPatch({ zone: 'Atlantis' }).dropped).toEqual(['zone'])
  })

  it('drops wrong-typed values instead of passing them to Postgres', () => {
    expect(buildMandalEditPatch({ is_public: 'yes', established_year: 'old' }).dropped).toEqual([
      'established_year',
      'is_public',
    ])
  })

  it('keeps the valid columns of a partly-invalid payload', () => {
    const { patch, dropped } = buildMandalEditPatch({
      name: 'Perfectly Fine Name',
      photo_url: 'javascript:alert(1)',
    })
    expect(patch).toEqual({ name: 'Perfectly Fine Name' })
    expect(dropped).toEqual(['photo_url'])
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

  it('records columns the patch schema rejected so they are not lost silently', () => {
    const trail = formatAuditTrail({ name: 'Old Name' }, { name: 'New Name' }, undefined, [
      'photo_url',
      'tags',
    ])
    expect(trail).toBe(
      '[prior values overwritten: {"name":"Old Name"}] [rejected as invalid: photo_url, tags]'
    )
  })

  it('appends the audit trail after the moderator’s own notes', () => {
    const trail = formatAuditTrail({ name: 'Old Name' }, { name: 'New Name' }, 'Looks legit')
    expect(trail).toBe('Looks legit\n\n[prior values overwritten: {"name":"Old Name"}]')
  })

  /**
   * Both approve functions write `coalesce(p_patch->>'x', x)`, so a null in
   * the patch changes nothing — recording it as overwritten logged edits that
   * never happened.
   */
  it('ignores null patch values, which the approve function treats as no-ops', () => {
    const trail = formatAuditTrail(
      { name: 'Old Name', description: 'Old description' },
      { name: 'New Name', description: null }
    )
    expect(trail).toBe('[prior values overwritten: {"name":"Old Name"}]')
  })

  it('still records a null `tags`, which does clear the column', () => {
    // tags is the exception: its CASE arm treats an explicit JSON null as
    // "clear the tags" rather than "leave alone".
    const trail = formatAuditTrail({ tags: ['oldest'] }, { tags: null })
    expect(trail).toBe('[prior values overwritten: {"tags":["oldest"]}]')
  })
})

describe('buildNewMandalInsert tolerance', () => {
  /**
   * Payloads aren't only written by submissions.create — the mandal dataset
   * import wrote 190 directly. Requiring every optional key to be *present*
   * made a row that merely omitted `timings` unapprovable with a ZodError.
   */
  it('accepts a payload that omits the optional columns entirely', () => {
    const row = buildNewMandalInsert(
      { name: 'Sparse Mandal', area: 'Sparse Area', lat: 19.07, lng: 72.87 },
      new Set()
    )

    expect(row.slug).toBe('sparse-mandal')
    expect(row.name).toBe('Sparse Mandal')
    // not-null default true in the table, so it must never come out null.
    expect(row.is_public).toBe(true)
  })

  it('still rejects a payload missing a genuinely required column', () => {
    expect(() =>
      buildNewMandalInsert({ name: 'No Coordinates', area: 'Nowhere' }, new Set())
    ).toThrow()
  })
})
