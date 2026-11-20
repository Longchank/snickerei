import { describe, expect, it } from 'vitest'
import { partBox, toAxisBox } from './geometry'
import { chooseScrew, pilotBit, screwJoints, screwName, screwTotals } from './screws'
import type { Part, Vec3 } from './types'

function at(id: string, profileId: string, length: number, rotation: Part['rotation'], min: Vec3, width?: number): Part {
  const p: Part = { id, name: id, profileId, length, position: [0, 0, 0], rotation, ...(width ? { width } : {}) }
  const b = toAxisBox(partBox(p))
  return { ...p, position: [0, 1, 2].map((i) => min[i] - b.min[i]) as Vec3 }
}
const UP: Part['rotation'] = [0, 0, 1]

describe('chooseScrew', () => {
  it('follows the 2.5 × rule and steps up the diameter with the thickness', () => {
    expect(screwName(chooseScrew(22, 45, false, false, false).screw)).toBe('4,5 × 60 träskruv')
    const s45 = chooseScrew(45, 95, false, false, false).screw
    expect(s45.length).toBeGreaterThanOrEqual(112)
    expect(s45.d).toBe(6)
  })

  it('goes longer into end grain, never through the far side, and flags a short screw', () => {
    const end = chooseScrew(45, 1000, true, false, false).screw
    expect(end.length).toBeGreaterThanOrEqual(135)
    const thin = chooseScrew(45, 45, false, false, false)
    expect(thin.screw.length).toBeLessThanOrEqual(85)
    expect(thin.short).toBe(true)
  })

  it('uses sheet screws for sheets and stainless for pressure-treated wood', () => {
    const s = chooseScrew(12, 70, false, true, false).screw
    expect(s.type).toBe('skivskruv')
    expect(s.length).toBeGreaterThanOrEqual(30)
    expect(chooseScrew(28, 45, false, false, true).screw.outdoor).toBe(true)
  })
})

describe('pilotBit', () => {
  it('is about the core of the screw', () => {
    expect(pilotBit(5, false)).toBe(3)
    expect(pilotBit(4, false)).toBe(2.5)
    expect(pilotBit(5, true)).toBe(4)
  })
})

describe('screwJoints', () => {
  // A sill with a post standing on its end, and a rail butting into the post's side
  const sill = at('sill', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 0, 0])
  const post = at('post', 'konstruktion-45x95', 1000, UP, [1155, 45, 0])
  const rail = at('rail', 'konstruktion-45x95', 600, [0, 0, 0], [555, 500, 0])

  it('screws through the sill up into the post’s end grain, near the sill’s end → pre-drill', () => {
    const [j] = screwJoints([sill, post])
    expect(j.through.id).toBe('sill')
    expect(j.into.id).toBe('post')
    expect(j.endGrain).toBe(true)
    expect(j.screw.length).toBeGreaterThanOrEqual(135)
    expect(j.count).toBe(2)
    expect(j.predrill?.bit).toBeGreaterThan(0)
  })

  it('screws through the post into the rail’s end', () => {
    const joints = screwJoints([post, rail])
    expect(joints).toHaveLength(1)
    expect(joints[0].through.id).toBe('post')
    expect(joints[0].into.id).toBe('rail')
    expect(joints[0].endGrain).toBe(true)
  })

  it('a sheet on joists: sheet screws through the sheet, c/c ~200', () => {
    const j1 = at('j1', 'konstruktion-45x70', 1000, [0, 1, 0], [0, 0, 0])
    const sheet = at('s', 'plywood-12', 1000, [0, 1, 0], [0, 45, 0], 600)
    const [j] = screwJoints([j1, sheet])
    expect(j.through.id).toBe('s')
    expect(j.screw.type).toBe('skivskruv')
    expect(j.count).toBe(6) // 1000 / 200 + 1
  })

  it('ignores parts that only meet at an edge, overlap, or stand apart', () => {
    const far = at('far', 'konstruktion-45x95', 500, [0, 0, 0], [0, 0, 500])
    const inside = at('in', 'konstruktion-45x95', 500, [0, 0, 0], [100, 10, 10])
    expect(screwJoints([sill, far])).toEqual([])
    expect(screwJoints([sill, inside])).toEqual([])
  })

  it('totals screws per size with about 10 % spare', () => {
    const totals = screwTotals(screwJoints([sill, post, rail]))
    const sum = totals.reduce((s, t) => s + t.count, 0)
    expect(sum).toBe(4)
    for (const t of totals) expect(t.toBuy).toBeGreaterThanOrEqual(t.count * 1.1)
  })
})

describe('thick pieces', () => {
  it('a 95 mm leg into a rail end gets a sensible screw, not a 280', () => {
    const s = chooseScrew(95, 1600, true, false, false)
    expect(s.screw.length).toBeLessThanOrEqual(240)
    expect(s.short).toBe(false)
  })
})

describe('screw positions', () => {
  it('sit on the outer face of the part screwed through, spread over the contact', () => {
    const sill = at('sill', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 0, 0])
    const post = at('post', 'konstruktion-45x95', 1000, UP, [1155, 45, 0])
    const [j] = screwJoints([sill, post])
    // Through the sill from below (its underside, y = 0), screwing up into the post
    expect(j.dir).toEqual([0, 1, 0])
    expect(j.points).toHaveLength(2)
    for (const p of j.points) {
      expect(p[1]).toBe(0)
      expect(p[0]).toBeCloseTo(1177.5, 1) // the post's centre along x
    }
    // Spread across the 95 mm contact: 23.75 and 71.25
    expect(j.points.map((p) => p[2]).sort((a, b) => a - b)).toEqual([23.75, 71.25])
  })

  it('a sheet on a joist gets a row along the joist, 40 mm in from the ends', () => {
    const j1 = at('j1', 'konstruktion-45x70', 1000, [0, 1, 0], [0, 0, 0])
    const sheet = at('s', 'plywood-12', 1000, [0, 1, 0], [0, 45, 0], 600)
    const [j] = screwJoints([j1, sheet])
    expect(j.dir).toEqual([0, -1, 0])
    const zs = j.points.map((p) => p[2])
    expect(Math.min(...zs)).toBe(40)
    expect(Math.max(...zs)).toBe(960)
    expect(j.points.every((p) => p[1] === 57)).toBe(true) // the sheet's top
  })
})
