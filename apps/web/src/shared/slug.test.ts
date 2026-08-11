import { describe, expect, it } from 'vitest'
import { generateSlug, slugify } from './slug'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Lalbaugcha Raja')).toBe('lalbaugcha-raja')
  })

  it('strips diacritics', () => {
    expect(slugify('Nikadwari Café')).toBe('nikadwari-cafe')
  })

  it('collapses punctuation and repeated separators into single hyphens', () => {
    expect(slugify("GSB Seva Mandal (King's Circle)")).toBe('gsb-seva-mandal-king-s-circle')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  --Andhericha Raja--  ')).toBe('andhericha-raja')
  })
})

describe('generateSlug', () => {
  it('returns the plain slug when there is no collision', () => {
    expect(generateSlug('Lalbaugcha Raja', 'Lalbaug', new Set())).toBe('lalbaugcha-raja')
  })

  it('appends the area slug on a first collision', () => {
    const existing = new Set(['lalbaugcha-raja'])
    expect(generateSlug('Lalbaugcha Raja', 'Lalbaug', existing)).toBe('lalbaugcha-raja-lalbaug')
  })

  it('appends a numeric suffix once the area-qualified slug also collides', () => {
    const existing = new Set(['lalbaugcha-raja', 'lalbaugcha-raja-lalbaug'])
    expect(generateSlug('Lalbaugcha Raja', 'Lalbaug', existing)).toBe('lalbaugcha-raja-lalbaug-2')
  })

  it('increments the numeric suffix past existing ones', () => {
    const existing = new Set([
      'lalbaugcha-raja',
      'lalbaugcha-raja-lalbaug',
      'lalbaugcha-raja-lalbaug-2',
      'lalbaugcha-raja-lalbaug-3',
    ])
    expect(generateSlug('Lalbaugcha Raja', 'Lalbaug', existing)).toBe('lalbaugcha-raja-lalbaug-4')
  })
})
