import { describe, expect, it } from 'vitest'
import { findPossibleDuplicates, haversineDistanceMeters } from './duplicate-check'

describe('haversineDistanceMeters', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistanceMeters({ lat: 19.03, lng: 72.92 }, { lat: 19.03, lng: 72.92 })).toBe(0)
  })

  it('matches the known ~111.2km distance for 1 degree of latitude', () => {
    const distance = haversineDistanceMeters({ lat: 19.0, lng: 72.9 }, { lat: 20.0, lng: 72.9 })
    expect(distance).toBeGreaterThan(111000)
    expect(distance).toBeLessThan(111400)
  })

  it('is symmetric', () => {
    const a = { lat: 18.99, lng: 72.83 }
    const b = { lat: 19.03, lng: 72.86 }
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(haversineDistanceMeters(b, a), 6)
  })
})

describe('findPossibleDuplicates', () => {
  const lalbaug = {
    id: '1',
    name: 'Lalbaugcha Raja',
    slug: 'lalbaugcha-raja',
    area: 'Lalbaug',
    lat: 18.9914,
    lng: 72.8365,
  }
  const farAway = {
    id: '2',
    name: 'Vashi Cha Raja',
    slug: 'vashi-cha-raja',
    area: 'Vashi',
    lat: 19.07,
    lng: 72.9966,
  }

  it('returns nothing when there are no candidates', () => {
    expect(findPossibleDuplicates('Any Name', { lat: 19.0, lng: 72.9 }, [])).toEqual([])
  })

  it('flags an exact name match regardless of distance', () => {
    const matches = findPossibleDuplicates('Vashi Cha Raja', { lat: 18.9914, lng: 72.8365 }, [
      lalbaug,
      farAway,
    ])
    expect(matches.map((m) => m.id)).toEqual(['2'])
  })

  it('flags a near-identical name at the same location', () => {
    const matches = findPossibleDuplicates('Lalbaugcha Raj', { lat: 18.9914, lng: 72.8365 }, [
      lalbaug,
      farAway,
    ])
    expect(matches.map((m) => m.id)).toContain('1')
    expect(matches[0].distanceMeters).toBeLessThan(50)
  })

  it('does not flag a dissimilar name that happens to be nearby', () => {
    const matches = findPossibleDuplicates(
      'Completely Different Mandal Name',
      { lat: 18.9914, lng: 72.8365 },
      [lalbaug]
    )
    expect(matches).toEqual([])
  })

  it('does not flag a dissimilar name far away', () => {
    const matches = findPossibleDuplicates(
      'Completely Different Mandal Name',
      { lat: 19.5, lng: 73.5 },
      [lalbaug, farAway]
    )
    expect(matches).toEqual([])
  })

  it('sorts multiple matches by name similarity, highest first', () => {
    const closeVariant = { ...lalbaug, id: '3', name: 'Lalbaugcha Rajaa' }
    const looseVariant = { ...lalbaug, id: '4', name: 'Lalbaugcha' }
    const matches = findPossibleDuplicates('Lalbaugcha Raja', { lat: 18.9914, lng: 72.8365 }, [
      looseVariant,
      closeVariant,
      lalbaug,
    ])
    expect(matches[0].id).toBe('1')
  })
})
