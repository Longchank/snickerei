import { describe, expect, it } from 'vitest'
import { freeSpace, measureValue, pickPoint } from './measure'
import type { Vec3 } from './types'

const box = (min: Vec3, max: Vec3) => ({ min, max })

describe('freeSpace', () => {
  // A table top 1200 x 22 x 800 at 718–740 mm, a stretcher below it, a lamp off to the side
  const top = box([0, 718, 0], [1200, 740, 800])
  const stretcher = { name: 'Sarg', box: box([100, 300, 380], [1100, 345, 425]) }
  const lamp = { name: 'Lampa', box: box([2000, 0, 0], [2100, 1500, 800]) }

  it('measures down to the nearest part under it, else the floor', () => {
    const fs = freeSpace(top, [stretcher, lamp])
    expect(fs.find((f) => f.direction === 'under')).toMatchObject({ gap: 373, to: 'Sarg' })
    expect(freeSpace(top, [lamp]).find((f) => f.direction === 'under')).toMatchObject({ gap: 718, to: 'golvet' })
  })

  it('finds parts to the side only when they line up', () => {
    const fs = freeSpace(top, [lamp])
    expect(fs.find((f) => f.direction === 'höger')).toMatchObject({ gap: 800, to: 'Lampa' })
    expect(fs.find((f) => f.direction === 'vänster')).toBeUndefined()
    expect(fs.find((f) => f.direction === 'över')).toBeUndefined()
  })

  it("sees past a table's legs to the floor", () => {
    const legs = [
      [0, 0],
      [1130, 0],
      [0, 730],
      [1130, 730],
    ].map(([x, z], i) => ({ name: `Ben ${i + 1}`, box: box([x, 0, z], [x + 70, 718, z + 70]) }))
    expect(freeSpace(top, legs).find((f) => f.direction === 'under')).toMatchObject({ gap: 718, to: 'golvet' })
  })

  it('draws the line through the shared area', () => {
    const under = freeSpace(top, [stretcher]).find((f) => f.direction === 'under')!
    expect(under.from).toEqual([600, 718, 402.5])
    expect(under.end).toEqual([600, 345, 402.5])
  })
})

describe('measureValue', () => {
  it('measures height from the floor, whichever tap came first', () => {
    const shelfTop = pickPoint([300, 740, 200], [0, 1, 0], false)
    const floor = pickPoint([900, 0, 600], [0, 1, 0], true)
    expect(measureValue({ a: shelfTop, b: floor })).toMatchObject({ value: 740, kind: 'height', axis: 1 })
    expect(measureValue({ a: floor, b: shelfTop })).toMatchObject({ value: 740, kind: 'height' })
  })

  it('measures the gap between two shelves straight up, ignoring sideways offset', () => {
    const lower = pickPoint([200, 318, 100], [0, 1, 0], false)
    const upper = pickPoint([500, 600, 250], [0, -1, 0], false)
    const m = measureValue({ a: lower, b: upper })
    expect(m).toMatchObject({ value: 282, kind: 'vgap' })
    expect(m.ends).toEqual([
      [200, 318, 100],
      [200, 600, 100],
    ])
  })

  it('measures along a surface when both taps are on the same plane', () => {
    // Both ends of a seat's top: its length
    const left = pickPoint([12, 450, 200], [0, 1, 0], false)
    const right = pickPoint([1790, 450, 230], [0, 1, 0], false)
    expect(measureValue({ a: left, b: right })).toMatchObject({ value: 1778, kind: 'horizontal', axis: 0 })
    // Two spots on the floor
    const f1 = pickPoint([0, 0, 0], [0, 1, 0], true)
    const f2 = pickPoint([300, 0, 900], [0, 1, 0], true)
    expect(measureValue({ a: f1, b: f2 })).toMatchObject({ value: 900, kind: 'horizontal', axis: 2 })
  })

  it('measures horizontally from a side face', () => {
    const left = pickPoint([0, 400, 300], [-1, 0, 0], false)
    const right = pickPoint([1800, 420, 310], [1, 0, 0], false)
    expect(measureValue({ a: left, b: right })).toMatchObject({ value: 1800, kind: 'horizontal', axis: 0 })
  })
})
