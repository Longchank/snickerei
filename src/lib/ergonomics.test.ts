import { describe, expect, it } from 'vitest'
import { GUIDES, matchGuides, offBy, seatsFor } from './ergonomics'

describe('matchGuides', () => {
  it('recognises a dining-table height', () => {
    const m = matchGuides(740, 'height')
    expect(m[0]).toMatchObject({ fit: 'ok' })
    expect(m.filter((x) => x.fit === 'ok').map((x) => x.guide.label)).toContain('Matbord')
  })

  it('marks values just outside a range as near', () => {
    const m = matchGuides(700, 'height').find((x) => x.guide.label === 'Matbord')
    expect(m?.fit).toBe('near')
  })

  it('only compares the same kind of measurement', () => {
    expect(matchGuides(450, 'horizontal').map((x) => x.guide.kind)).not.toContain('height')
  })

  it('puts narrow ranges first', () => {
    const labels = matchGuides(450, 'height').map((x) => x.guide.label)
    expect(labels.indexOf('Sitthöjd stol/bänk')).toBeLessThan(labels.indexOf('Hylla som nås utan pall'))
  })
})

describe('helpers', () => {
  it('counts seats', () => {
    expect(seatsFor(1800)).toBe(3)
    expect(seatsFor(1150)).toBe(1)
  })

  it('writes seats in Swedish', async () => {
    const { seatsText } = await import('./ergonomics')
    expect(seatsText(700)).toBe('plats för 1 person')
    expect(seatsText(1800)).toBe('plats för 3 personer')
  })

  it('says how far off a value is', () => {
    const table = GUIDES.find((g) => g.label === 'Matbord')!
    expect(offBy(700, table)).toBe(-20)
    expect(offBy(740, table)).toBe(0)
    expect(offBy(800, table)).toBe(40)
  })
})
