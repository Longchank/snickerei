import { describe, expect, it } from 'vitest'
import { cutList, purchasePlan } from './cutlist'
import { frameUnder, seamOffsets, splitSheet } from './frame'
import { bestSeams } from './seams'
import { partBox, toAxisBox } from './geometry'
import type { Part, SheetFrame } from './types'

const frame: SheetFrame = { profileId: 'konstruktion-45x70', joists: 4, onEdge: true, axis: 0 }
// A 3000 × 600 shelf: too long for a 2440 × 1220 plywood sheet in one piece
const long: Part = { id: 'h', name: 'Hylla', profileId: 'plywood-18', length: 3000, width: 600, position: [0, 900, 0], rotation: [0, 0, 0], frame }

describe('splitting a sheet over its joists', () => {
  it('puts the seams on the joist centres and keeps the full length', () => {
    const s = { ...long, frame: { ...frame, seams: [2] } }
    // Joists c/c (3000 − 45) / 5 = 591, centre of joist 2 at 22.5 + 2·591
    expect(seamOffsets(s)).toEqual([1205]) // rounded to whole mm
    const parts = splitSheet(s)
    expect(parts.map((p) => [p.length, p.width])).toEqual([[1205, 600], [1795, 600]])
    // The seam lands on joist 2 (45 wide, from 1182 to 1227)
    const j2 = frameUnder(s, s.frame).parts.filter((p) => p.role === 'Tvärregel')[1]
    const jb = toAxisBox(partBox({ ...j2, id: '', name: '' }))
    expect(jb.min[0]).toBeLessThan(1205)
    expect(jb.max[0]).toBeGreaterThan(1205)
  })

  it('cut list and shopping list use the pieces', () => {
    const s = { ...long, frame: { ...frame, seams: [2] } }
    expect(cutList([s]).map((r) => r.length).sort()).toEqual([1205, 1795])
    const plan = purchasePlan([s], [], 3)[0]
    expect(plan.kind === 'sheet' && plan.tooLarge).toEqual([])
  })

  it('ignores seams on joists that no longer exist', () => {
    const s = { ...long, frame: { ...frame, joists: 1, seams: [3] } }
    expect(splitSheet(s)).toHaveLength(1)
  })
})

describe('bestSeams', () => {
  it('splits a sheet that is too long once, evenly, onto one store sheet', () => {
    const { seams, plan } = bestSeams('h', [long], [], 3)
    expect(seams).toHaveLength(1)
    expect(plan!.tooLarge).toEqual([])
    expect(plan!.sheets).toHaveLength(1)
    expect([2, 3]).toContain(seams[0])
  })

  it('leaves a sheet whole when that is just as good', () => {
    const short = { ...long, length: 1800 }
    expect(bestSeams('h', [short], [], 3).seams).toEqual([])
  })

  it('counts the other sheets of the same material', () => {
    // Another 2400 × 600 piece already needs most of a sheet: splitting the shelf
    // still lets everything fit on two store sheets
    const other: Part = { id: 'o', name: 'Annan', profileId: 'plywood-18', length: 2400, width: 600, position: [0, 0, 2000], rotation: [0, 0, 0] }
    const { plan } = bestSeams('h', [long, other], [], 3)
    expect(plan!.tooLarge).toEqual([])
    expect(plan!.sheets.length).toBeLessThanOrEqual(2)
  })
})
