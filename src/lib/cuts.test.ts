import { describe, expect, it } from 'vitest'
import { cutList, purchasePlan } from './cutlist'
import { cutSetback, describeCuts, isCutAway, miterCorner, ripPart } from './cuts'
import { overlapsOf, toLocalBox } from './joints'
import type { Part } from './types'

const part = (id: string, length: number, extra: Partial<Part> = {}): Part => ({
  id,
  name: id,
  profileId: 'konstruktion-45x95',
  length,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  ...extra,
})

describe('end cuts', () => {
  // 45x95: thickness 45 (y), width 95 (z)
  const mitered = part('m', 1000, { ends: [{ plane: 'face', angle: 45 }, { plane: 'edge', angle: -30 }] })

  it('removes the wedge at the start, keeping the long point at z = 0', () => {
    expect(isCutAway(mitered, [10, 20, 50])).toBe(true) // short side
    expect(isCutAway(mitered, [60, 20, 50])).toBe(false)
    expect(isCutAway(mitered, [1, 20, 1])).toBe(false) // long point
  })

  it('bevels the end with the long point at y = T for a negative angle', () => {
    expect(isCutAway(mitered, [995, 2, 50])).toBe(true)
    expect(isCutAway(mitered, [999, 44, 50])).toBe(false)
  })

  it('reports setback and describes the cuts', () => {
    expect(cutSetback(mitered, { plane: 'face', angle: 45 })).toBeCloseTo(95)
    expect(describeCuts(mitered)).toEqual([
      'Gering 45° i början (längden mätt på långsidan)',
      'Gering på högkant 30° i slutet (längden mätt på långsidan)',
    ])
  })
})

describe('miterCorner', () => {
  // Two flat 45x95 boards forming an L in the XZ plane, overlapping in a 95x95 corner
  const a = part('a', 1000)
  const b = part('b', 1000, { position: [0, 0, 1000], rotation: [0, 1, 0] })

  it('cuts both ends at 45° so the corner no longer overlaps', () => {
    const [o] = overlapsOf(a, [b])
    expect(o.box).toEqual({ min: [0, 0, 0], max: [95, 45, 95] })
    const result = miterCorner(a, b, o.box, toLocalBox)
    expect(result).not.toBeNull()
    const [ma, mb] = result!
    expect(Math.abs(ma.ends![0]!.angle)).toBe(45)
    expect(ma.ends![0]!.plane).toBe('face')
    expect(Math.abs(mb.ends![1]!.angle)).toBe(45)
    expect(overlapsOf(ma, [mb])).toEqual([])
  })
})

describe('French cleat', () => {
  const board = part('c', 1200, { profileId: 'hyvlat-21x95' })
  const [h0, h1] = ripPart(board, 45, 3, (() => { let n = 0; return () => `id${n++}` })())

  it('splits into two halves that fit together', () => {
    expect(h0.rip).toMatchObject({ half: 0, angle: 45 })
    expect(h1.rip).toMatchObject({ half: 1 })
    // 21 mm thick at 45°: the cut crosses z = 47.5 ± 10.5
    expect(isCutAway(h0, [100, 0, 30])).toBe(false)
    expect(isCutAway(h0, [100, 0, 60])).toBe(true)
    expect(isCutAway(h1, [100, 21, 70])).toBe(false)
    expect(isCutAway(h1, [100, 21, 40])).toBe(true)
    expect(overlapsOf(h0, [h1])).toEqual([])
  })

  it('counts as one board in the cut list and shopping list', () => {
    const rows = cutList([h0, h1])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ length: 1200, count: 1 })
    expect(rows[0].notes).toEqual(['Klyvs på längden i 45° till två delar (fransk list)'])
    const [plan] = purchasePlan([h0, h1], [], 3)
    expect(plan.kind === 'board' && plan.boards).toHaveLength(1)
  })
})
