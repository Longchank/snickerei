import { describe, expect, it } from 'vitest'
import { isCutAway } from './cuts'
import { partBox, toAxisBox } from './geometry'
import { copyPlane, mirrorPart } from './mirror'
import type { Part } from './types'

const box = (p: Part) => toAxisBox(partBox(p))
const leg: Part = { id: 'l', name: 'Ben', profileId: 'konstruktion-45x95', length: 700, position: [45, 0, 0], rotation: [0, 0, 1] }

describe('mirrorPart', () => {
  it('moves a part to its mirror place across a plane, keeping its size', () => {
    const m = mirrorPart(leg, 0, 600) // x 0..45 → 1155..1200
    expect(box(m)).toEqual({ ...box(leg), min: [1155, 0, 0], max: [1200, 700, 95] })
  })

  it('mirrors an angled end cut: along the length the ends swap, across it the long point flips', () => {
    const rail: Part = { id: 'r', name: 'r', profileId: 'konstruktion-45x95', length: 1000, position: [0, 0, 0], rotation: [0, 0, 0], ends: [{ plane: 'face', angle: 45 }, null] }
    const along = mirrorPart(rail, 0, 500)
    expect(along.ends).toEqual([null, { plane: 'face', angle: 45 }])
    const across = mirrorPart(rail, 2, 47.5)
    expect(across.ends![0]!.angle).toBe(-45)
    // A point cut away near (x small, z small) is kept on the mirrored part where z is mirrored
    const before = isCutAway(rail, [5, 20, 90])
    const after = isCutAway(across, [5, 20, 95 - 90])
    expect(after).toBe(before)
  })

  it('mirrors notches in the part’s own coordinates', () => {
    const p: Part = { ...leg, notches: [{ min: [0, 0, 0], max: [100, 45, 20], kind: 'urtag' }] }
    // Mirroring across z flips the leg's width (its local z)
    const m = mirrorPart(p, 2, 47.5)
    expect(m.notches![0].min[2]).toBe(75)
    expect(m.notches![0].max[2]).toBe(95)
  })
})

describe('copyPlane', () => {
  const all = { min: [0, 0, 0] as [number, number, number], max: [1200, 900, 600] as [number, number, number] }
  it('mirrors a left-side selection across the middle of the build', () => {
    expect(copyPlane({ min: [0, 0, 0], max: [45, 900, 600] }, all, 0)).toBe(600)
  })
  it('puts the copy next to a selection that spans the middle', () => {
    expect(copyPlane({ min: [0, 0, 0], max: [1200, 900, 600] }, all, 0)).toBe(1200)
  })
})
