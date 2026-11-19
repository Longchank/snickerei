import { describe, expect, it } from 'vitest'
import { partBox, toAxisBox } from './geometry'
import { contactOf, describePlacement, floorTapTarget, placementOptions, placeOnFloor, placeOnPart, reorientOptions, rotationFor, samePlacement, sheetBetween } from './place'
import type { Part, Vec3 } from './types'

let n = 0
const make = (p: Omit<Part, 'id' | 'name'>, name?: string): Part => {
  const id = `p${n++}`
  return { ...p, id, name: name ?? id }
}
const box = (p: Omit<Part, 'id' | 'name'>) => toAxisBox(partBox({ ...p, id: '', name: '' }))

// A sill: 45x95 lying flat along X, x 0..1200, y 0..45, z 0..95
const sill = make({ profileId: 'konstruktion-45x95', length: 1200, position: [0, 0, 0], rotation: [0, 0, 0] }, 'Syll')
const UP: Vec3 = [0, 1, 0]

describe('rotationFor', () => {
  it('finds a rotation for every length/width axis pair', () => {
    for (const l of [0, 1, 2] as const)
      for (const w of [0, 1, 2] as const) {
        if (l === w) continue
        const r = rotationFor(l, w)
        const b = box({ profileId: 'konstruktion-45x95', length: 1000, position: [0, 0, 0], rotation: r })
        const size = [0, 1, 2].map((i) => b.max[i] - b.min[i])
        expect(size[l]).toBe(1000)
        expect(size[w]).toBe(95)
      }
  })
})

describe('placeOnPart: on a side face', () => {
  it('stands a post at the end of the sill, flush with its end', () => {
    const p = placeOnPart('konstruktion-45x95', sill, [1150, 45, 40], UP, [sill])
    expect(p.anchor).toBe('end')
    const b = box(p.part)
    expect(b.min).toEqual([1155, 45, 0])
    expect(b.max).toEqual([1200, 1045, 95])
  })

  it('stands one at the start and one in the middle', () => {
    expect(box(placeOnPart('konstruktion-45x95', sill, [40, 45, 40], UP, [sill]).part).min).toEqual([0, 45, 0])
    const mid = placeOnPart('konstruktion-45x95', sill, [610, 45, 40], UP, [sill])
    expect(mid.anchor).toBe('mid')
    expect(box(mid.part).min[0]).toBe(577.5)
  })

  it('places exactly where tapped between the snap zones', () => {
    const p = placeOnPart('konstruktion-45x95', sill, [400, 45, 40], UP, [sill])
    expect(p.anchor).toBe('free')
    expect(box(p.part).min[0]).toBe(377.5)
  })

  it('fills up to a top rail above', () => {
    const rail = make({ profileId: 'konstruktion-45x95', length: 1200, position: [0, 800, 0], rotation: [0, 0, 0] }, 'Överliggare')
    const p = placeOnPart('konstruktion-45x95', sill, [1150, 45, 40], UP, [sill, rail])
    expect(p.part.length).toBe(755)
    expect(describePlacement(p)).toBe('Stående, vid änden · 755 mm, fyller upp till Överliggare')
  })
})

describe('placeOnPart: on an end face', () => {
  it('runs a top rail from one post across to the other', () => {
    // Two posts standing on the sill's ends, 1000 tall
    const post = (x: number) => placeOnPart('konstruktion-45x95', sill, [x, 45, 40], UP, [sill]).part
    const left = make(post(40), 'Stolpe 1')
    const right = make(post(1160), 'Stolpe 2')
    const parts = [sill, left, right]
    // Tap the top end of the left post
    const p = placeOnPart('konstruktion-45x95', left, [20, 1045, 40], UP, parts)
    const b = box(p.part)
    expect(b.min).toEqual([0, 1045, 0])
    expect(b.max).toEqual([1200, 1090, 95])
    expect(p.lengthReason).toBe('span')
    expect(p.lengthFrom).toBe('Stolpe 2')
  })
})

describe('placeOnFloor', () => {
  it('lays the board flat at the tapped spot', () => {
    expect(box(placeOnFloor('konstruktion-45x70', [512, 0, 303]).part).min).toEqual([510, 0, 305])
  })
})

describe('floorTapTarget', () => {
  it('treats a floor tap just beside a part on the floor as a tap on its top', () => {
    const t = floorTapTarget([600, 0, 130], [sill])
    expect(t?.part.id).toBe(sill.id)
    expect(t?.hit).toEqual([600, 45, 95])
  })

  it('leaves clear floor alone', () => {
    expect(floorTapTarget([600, 0, 400], [sill])).toBeNull()
  })
})

describe('placementOptions', () => {
  it('offers the tapped direction first, then standing up, then the others', () => {
    // Tapped the sill's front face at its start
    const opts = placementOptions('konstruktion-45x95', sill, [20, 20, 95], [0, 0, 1], [sill])
    const dirs = opts.map((o) => {
      const b = box(o.part)
      const size = [0, 1, 2].map((i) => b.max[i] - b.min[i])
      return size.indexOf(Math.max(...size))
    })
    expect(dirs[0]).toBe(2) // out of the front face
    expect(dirs[1]).toBe(1) // standing up
    expect(opts.length).toBeGreaterThanOrEqual(3)
    // None goes down through the floor
    for (const o of opts) expect(box(o.part).min[1]).toBeGreaterThanOrEqual(0)
  })

  it('puts standing on top first for a missed tap', () => {
    const [first] = placementOptions('konstruktion-45x95', sill, [20, 20, 95], [0, 0, 1], [sill], true)
    expect(box(first.part).min).toEqual([0, 45, 0])
    expect(first.part.length).toBe(1000)
  })
})

describe('reorientOptions (Annan riktning for a placed board)', () => {
  // A post placed by tapping the top of the sill near its end
  const placed = placeOnPart('konstruktion-45x95', sill, [1180, 45, 40], UP, [sill])
  const post = make(placed.part, 'Stolpe')

  it('finds what the board stands on, at its own end', () => {
    const c = contactOf(post, [sill])!
    expect(c.target.id).toBe(sill.id)
    expect(c.normal).toEqual([0, 1, 0])
    expect(c.hit[1]).toBe(45)
  })

  it('offers the same alternatives as when placing, including the current one', () => {
    const opts = reorientOptions(post, [sill, post])
    expect(opts.length).toBeGreaterThanOrEqual(3)
    expect(opts.some((o) => samePlacement(o.part, post))).toBe(true)
    // Every option still sits at the sill's end
    for (const o of opts) expect(box(o.part).max[0]).toBeGreaterThan(1100)
  })

  it('has nothing to offer for a board touching nothing', () => {
    const lone = make({ ...sill, position: [0, 0, 3000] })
    expect(reorientOptions(lone, [sill, lone])).toEqual([])
  })
})

describe('sheetBetween (two-tap sheets)', () => {
  it('lays a sheet on the floor between two corners, longer side as length', () => {
    const p = sheetBetween('plywood-12', { point: [1200, 0, 600], axis: 1, sign: 1 }, [0, 0, 0])!
    expect(box(p)).toEqual({ min: [0, 0, 0], max: [1200, 12, 600] })
    expect([p.length, p.width]).toEqual([1200, 600])
  })

  it('lies on top of a frame and runs the length the long way', () => {
    const p = sheetBetween('plywood-18', { point: [0, 745, 0], axis: 1, sign: 1 }, [600, 900, 1500])!
    expect(box(p)).toEqual({ min: [0, 745, 0], max: [600, 763, 1500] })
    expect(p.length).toBe(1500)
  })

  it('stands against the side of a post, and refuses a sliver', () => {
    const p = sheetBetween('osb-12', { point: [0, 0, 95], axis: 2, sign: 1 }, [800, 1200, 95])!
    expect(box(p)).toEqual({ min: [0, 0, 95], max: [800, 1200, 107] })
    // Facing the other way it goes behind the face
    const q = sheetBetween('osb-12', { point: [0, 0, 0], axis: 2, sign: -1 }, [800, 1200, 0])!
    expect(box(q).min[2]).toBe(-12)
    expect(sheetBetween('osb-12', { point: [0, 0, 0], axis: 1, sign: 1 }, [800, 0, 5])).toBeNull()
  })
})
