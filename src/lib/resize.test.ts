import { describe, expect, it } from 'vitest'
import { partBox, toAxisBox } from './geometry'
import { unionBox } from './joints'
import { setSizeAlong, stretchParts } from './resize'
import type { Part, Vec3 } from './types'

const box = (p: Part) => toAxisBox(partBox(p))
function at(id: string, profileId: string, length: number, rotation: Part['rotation'], min: Vec3, width?: number): Part {
  const p: Part = { id, name: id, profileId, length, position: [0, 0, 0], rotation, ...(width ? { width } : {}) }
  const b = box(p)
  return { ...p, position: [0, 1, 2].map((i) => min[i] - b.min[i]) as Vec3 }
}
const UP: Part['rotation'] = [0, 0, 1]

// A bench frame seen from the front: two legs, a rail between them, a top across everything, a middle leg
const legL = at('legL', 'konstruktion-45x70', 700, UP, [0, 0, 0])
const legR = at('legR', 'konstruktion-45x70', 700, UP, [1155, 0, 0])
const legM = at('legM', 'konstruktion-45x70', 700, UP, [577.5, 0, 0])
const rail = at('rail', 'konstruktion-45x70', 1110, [0, 0, 0], [45, 300, 0])
const top = at('top', 'plywood-18', 1200, [0, 0, 0], [0, 700, 0], 600)
const bench = [legL, legR, legM, rail, top]

describe('setSizeAlong', () => {
  it('changes a board’s length and keeps its lower end', () => {
    const p = setSizeAlong(legR, 1, 900)
    expect(box(p)).toEqual({ ...box(legR), max: [1200, 900, 70] })
    expect(p.length).toBe(900)
  })

  it('changes a sheet’s width along its own axis', () => {
    const t = setSizeAlong(top, 2, 500)
    expect(t.width).toBe(500)
    expect(box(t).min).toEqual(box(top).min)
  })
})

describe('stretchParts', () => {
  it('makes a bench longer: end legs stay flush, rail and top grow, profiles stay', () => {
    const out = stretchParts(bench, 0, 1500)
    const [l, r, mid, ra, t] = out
    expect(unionBox(out)!.max[0] - unionBox(out)!.min[0]).toBe(1500)
    expect(box(l)).toEqual(box(legL))
    expect(box(r).min[0]).toBe(1455)
    expect(box(r).max[0] - box(r).min[0]).toBe(45) // still a 45×70
    // The middle leg stays in the middle
    expect((box(mid).min[0] + box(mid).max[0]) / 2).toBe(750)
    // The rail runs from the left leg to the right leg
    expect(box(ra).min[0]).toBe(45)
    expect(box(ra).max[0]).toBe(1455)
    expect(ra.length).toBe(1410)
    expect(t.length).toBe(1500)
  })

  it('makes it taller: legs get longer, the top moves up, the rail keeps its height', () => {
    const out = stretchParts(bench, 1, 918)
    const byId = new Map(out.map((p) => [p.id, p]))
    expect(byId.get('legL')!.length).toBe(900)
    expect(box(byId.get('top')!).min[1]).toBe(900)
    expect(box(byId.get('top')!).max[1] - box(byId.get('top')!).min[1]).toBe(18) // sheet thickness locked
    // The rail sits partway up: it keeps its relative height
    expect(box(byId.get('rail')!).max[1] - box(byId.get('rail')!).min[1]).toBe(45)
  })

  it('round-trips back to the original size', () => {
    const back = stretchParts(stretchParts(bench, 0, 1500), 0, 1200)
    expect(back.map(box)).toEqual(bench.map(box))
  })
})

describe('stretchParts keeps tucked-in parts with their corner', () => {
  it('a leg inside the corner, behind an end rail, stays in that corner', () => {
    // End rails at both ends (running along z, 70 wide along x), legs just inside them
    const endL = at('endL', 'konstruktion-45x70', 600, [0, 1, 0], [0, 700, 0])
    const endR = at('endR', 'konstruktion-45x70', 600, [0, 1, 0], [1130, 700, 0])
    expect(box(endL).max[0] - box(endL).min[0]).toBe(70)
    const legIn = at('legIn', 'konstruktion-45x95', 745, UP, [70, 0, 45])
    const legInR = at('legInR', 'konstruktion-45x95', 745, UP, [1085, 0, 45])
    const out = stretchParts([endL, endR, legIn, legInR], 0, 1500)
    const byId = new Map(out.map((p) => [p.id, box(p)]))
    expect(byId.get('legIn')!.min[0]).toBe(70) // still against the left end rail
    expect(byId.get('legInR')!.max[0]).toBe(1430) // still against the right end rail
    expect(byId.get('endR')!.max[0]).toBe(1500)
  })
})
