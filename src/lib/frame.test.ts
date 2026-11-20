import { beforeEach, describe, expect, it } from 'vitest'
import { frameUnder, defaultJoists, isLyingSheet, joistSpacing, seamOffsets } from './frame'
import { partBox, toAxisBox } from './geometry'
import { overlapsOf } from './joints'
import { useStore } from './store'
import type { Part } from './types'

const box = (p: Omit<Part, 'id' | 'name'>) => toAxisBox(partBox({ ...p, id: '', name: '' }))
// An 1800 × 600 shelf of 18 mm plywood, 900 mm up
const sheet: Part = { id: 's', name: 's', profileId: 'plywood-18', length: 1800, width: 600, position: [0, 900, 0], rotation: [0, 0, 0] }

describe('frameUnder', () => {
  it('builds long rails, end rails and evenly spaced joists flush under the sheet', () => {
    expect(isLyingSheet(sheet)).toBe(true)
    expect(defaultJoists(sheet)).toBe(2)
    const f = { profileId: 'konstruktion-45x70', joists: 2, onEdge: true }
    const { parts, lift } = frameUnder(sheet, f)
    expect(lift).toBe(0)
    expect(parts.map((p) => p.role)).toEqual(['Långregel', 'Långregel', 'Kortregel', 'Tvärregel', 'Tvärregel', 'Kortregel'])
    // Long rails: full length, on edge (70 high, 45 wide), at the front and back edges
    expect(box(parts[0])).toEqual({ min: [0, 830, 0], max: [1800, 900, 45] })
    expect(box(parts[1])).toEqual({ min: [0, 830, 555], max: [1800, 900, 600] })
    // End rails between them, flush with the ends
    expect(box(parts[2])).toEqual({ min: [0, 830, 45], max: [45, 900, 555] })
    expect(box(parts[5])).toEqual({ min: [1755, 830, 45], max: [1800, 900, 555] })
    // Joists evenly spaced: c/c (1800 − 45) / 3 = 585
    expect(joistSpacing(sheet, f)).toBe(585)
    expect(box(parts[3]).min[0]).toBe(585)
    expect(box(parts[4]).min[0]).toBe(1170)
    // Nothing collides
    const real = parts.map((p, i) => ({ ...p, id: `f${i}`, name: `f${i}` }))
    for (const p of real) expect(overlapsOf(p, [...real, sheet])).toEqual([])
  })

  it('lays boards flat, and lifts the sheet when it lies on the floor', () => {
    const floor = { ...sheet, position: [0, 0, 0] as Part['position'] }
    const { parts, lift } = frameUnder(floor, { profileId: 'konstruktion-45x95', joists: 0, onEdge: false })
    expect(lift).toBe(45)
    expect(box(parts[0])).toEqual({ min: [0, 0, 0], max: [1800, 45, 95] })
    expect(parts).toHaveLength(4)
  })

  it('runs along z when the sheet is longer that way', () => {
    const turned: Part = { ...sheet, rotation: [0, 1, 0] }
    const b = box(turned)
    expect(b.max[2] - b.min[2]).toBe(1800)
    const { parts } = frameUnder(turned, { profileId: 'konstruktion-45x45', joists: 1, onEdge: true })
    const lb = box(parts[0])
    expect(lb.max[2] - lb.min[2]).toBe(1800)
  })
})

describe('store: copying a sheet with its frame', () => {
  beforeEach(() => useStore.getState().newProject())

  it('keeps the copy’s frame editable and separate from the original', () => {
    useStore.setState((s) => ({ project: { ...s.project, parts: [sheet] }, selection: ['s'] }))
    const st = () => useStore.getState()
    st().openFrame('s')
    st().closeFrame()
    const original = st().project.parts.map((p) => p.id)
    expect(original).toHaveLength(7) // sheet + 2 long + 2 end rails + 2 joists
    // Copy the whole group (sheet + frame)
    st().duplicateSelection()
    const copyIds = st().selection
    const copySheet = st().project.parts.find((p) => copyIds.includes(p.id) && p.frame)!
    const copyFrame = st().project.parts.filter((p) => copyIds.includes(p.id) && p.frameOf)
    expect(copyFrame).toHaveLength(6)
    expect(copyFrame.every((p) => p.frameOf === copySheet.id)).toBe(true)
    // Editing the copy's frame leaves the original alone
    st().openFrame(copySheet.id)
    st().applyFrame({ ...copySheet.frame!, joists: 4 })
    st().closeFrame()
    expect(st().project.parts.filter((p) => p.frameOf === copySheet.id)).toHaveLength(8)
    expect(st().project.parts.filter((p) => p.frameOf === 's')).toHaveLength(6)
  })

  it('a frame board copied on its own becomes a plain board', () => {
    useStore.setState((s) => ({ project: { ...s.project, parts: [sheet] }, selection: ['s'] }))
    useStore.getState().openFrame('s')
    useStore.getState().closeFrame()
    const board = useStore.getState().project.parts.find((p) => p.frameOf === 's')!
    useStore.setState({ selection: [board.id] })
    useStore.getState().duplicateSelection()
    const copy = useStore.getState().project.parts.find((p) => p.id === useStore.getState().selection[0])!
    expect(copy.frameOf).toBeUndefined()
  })
})

describe('legs', () => {
  const base = { profileId: 'konstruktion-45x70', joists: 1, onEdge: true }
  const real = (ps: ReturnType<typeof frameUnder>['parts'], dy: number, s: Part) => {
    const sheetUp = { ...s, position: [s.position[0], s.position[1] + dy, s.position[2]] as Part['position'] }
    return [sheetUp, ...ps.map((p, i) => ({ ...p, id: `f${i}`, name: p.role }))]
  }
  const legBoxes = (ps: ReturnType<typeof frameUnder>['parts']) => ps.filter((p) => p.role === 'Ben').map(box)

  for (const placement of ['inside', 'outside', 'under', 'merged'] as const) {
    it(`${placement}: four legs to the floor, sheet top at the set height, nothing collides`, () => {
      const { parts, lift } = frameUnder(sheet, { ...base, legs: { profileId: 'konstruktion-45x95', placement, height: 900 } })
      expect(lift).toBe(900 - 918) // the sheet's top moves to 900
      const legs = legBoxes(parts)
      expect(legs).toHaveLength(4)
      for (const l of legs) {
        expect(l.min[1]).toBe(0)
        // 45×95 leg: wide face along the long way (x)
        expect(l.max[0] - l.min[0]).toBe(95)
        expect(l.max[2] - l.min[2]).toBe(45)
      }
      const top = placement === 'under' ? 900 - 18 - 70 : 900 - 18
      expect(legs[0].max[1]).toBe(top)
      const all = real(parts, lift, sheet)
      for (const p of all) expect(overlapsOf(p, all)).toEqual([])
    })
  }

  it('inside sits in the inner corner, outside outside the long rail, merged in the corner', () => {
    const at = (placement: 'inside' | 'outside' | 'merged') =>
      legBoxes(frameUnder(sheet, { ...base, legs: { profileId: 'konstruktion-45x95', placement, height: 900 } }).parts)[0]
    expect(at('inside').min).toEqual([45, 0, 45])
    expect(at('outside').min).toEqual([0, 0, -45])
    expect(at('merged').min).toEqual([0, 0, 0])
  })

  it('merged: the rails are shortened to fit between the legs', () => {
    const { parts } = frameUnder(sheet, { ...base, legs: { profileId: 'konstruktion-45x95', placement: 'merged', height: 900 } })
    const long = parts.filter((p) => p.role === 'Långregel').map(box)
    expect(long[0].min[0]).toBe(95)
    expect(long[0].max[0]).toBe(1705)
    const ends = parts.filter((p) => p.role === 'Kortregel').map(box)
    expect(ends[0].min[2]).toBe(45)
    expect(ends[0].max[2]).toBe(555)
  })

  it('merged with legs narrower than the rails still fits without collisions', () => {
    const f = { profileId: 'konstruktion-45x95', joists: 1, onEdge: false, legs: { profileId: 'konstruktion-45x45', placement: 'merged' as const, height: 900 } }
    const { parts, lift } = frameUnder(sheet, f)
    const all = real(parts, lift, sheet)
    for (const p of all) expect(overlapsOf(p, all)).toEqual([])
  })

  it('never puts the top lower than the frame needs', () => {
    const { lift } = frameUnder(sheet, { ...base, legs: { profileId: 'konstruktion-45x95', placement: 'under', height: 50 } })
    // 18 sheet + 70 frame + 50 legs
    expect(918 + lift).toBe(138)
  })
})

describe('store: frame and legs end up where the sheet is', () => {
  beforeEach(() => useStore.getState().newProject())

  it('a sheet on the floor gets lifted onto its frame and legs, with nothing floating or colliding', () => {
    const onFloor: Part = { ...sheet, position: [0, 0, 0] }
    useStore.setState((s) => ({ project: { ...s.project, parts: [onFloor] }, selection: ['s'] }))
    const st = () => useStore.getState()
    st().openFrame('s')
    for (const placement of ['inside', 'outside', 'under', 'merged'] as const) {
      st().applyFrame({ ...st().project.parts.find((p) => p.id === 's')!.frame!, legs: { profileId: 'konstruktion-45x95', placement, height: 900 } })
      const parts = st().project.parts
      const sb = box(parts.find((p) => p.id === 's')!)
      expect(sb.max[1]).toBe(900)
      const rails = parts.filter((p) => p.name.startsWith('Långregel')).map(box)
      expect(rails[0].max[1]).toBe(sb.min[1]) // the frame is right under the sheet
      const legs = parts.filter((p) => p.name.startsWith('Ben')).map(box)
      expect(legs.every((l) => l.min[1] === 0)).toBe(true)
      for (const p of parts) expect(overlapsOf(p, parts)).toEqual([])
    }
    st().closeFrame()
  })
})

describe('store: sheet covering outside legs', () => {
  beforeEach(() => useStore.getState().newProject())

  it('widens the sheet over the legs, keeps the frame in place, and narrows back', () => {
    useStore.setState((s) => ({ project: { ...s.project, parts: [sheet] }, selection: ['s'] }))
    const st = () => useStore.getState()
    const sheetBox = () => box(st().project.parts.find((p) => p.id === 's')!)
    st().openFrame('s')
    const f0 = st().project.parts.find((p) => p.id === 's')!.frame!
    const legs = { profileId: 'konstruktion-45x95', placement: 'outside' as const, height: 918 }
    st().applyFrame({ ...f0, legs: { ...legs, cover: true } })
    // 45 mm legs outside each long side: the sheet grows 45 mm each way across
    expect(sheetBox().min[2]).toBe(-45)
    expect(sheetBox().max[2]).toBe(645)
    expect(sheetBox().max[0] - sheetBox().min[0]).toBe(1800) // the long way is untouched
    const parts = st().project.parts
    const rails = parts.filter((p) => p.name.startsWith('Långregel')).map(box)
    expect([rails[0].min[2], rails[1].max[2]]).toEqual([0, 600]) // frame still under the original sheet
    const legBoxes = parts.filter((p) => p.name.startsWith('Ben')).map(box)
    expect(legBoxes.every((l) => l.min[2] >= -45 && l.max[2] <= 645 && l.max[1] === sheetBox().min[1])).toBe(true)
    for (const p of parts) expect(overlapsOf(p, parts)).toEqual([])
    // Untick: back to the original width
    st().applyFrame({ ...f0, legs: { ...legs, cover: false } })
    expect([sheetBox().min[2], sheetBox().max[2]]).toEqual([0, 600])
    // Tick again, close, reopen, then remove the frame: the sheet goes back too
    st().applyFrame({ ...f0, legs: { ...legs, cover: true } })
    st().closeFrame()
    st().openFrame('s')
    expect(sheetBox().max[2] - sheetBox().min[2]).toBe(690)
    st().removeFrame()
    expect([sheetBox().min[2], sheetBox().max[2]]).toEqual([0, 600])
  })
})

describe('outside legs at the ends', () => {
  beforeEach(() => useStore.getState().newProject())

  it('stand beside the end rails, wide face across, and the sheet can cover them; switching side moves the cover', () => {
    useStore.setState((s) => ({ project: { ...s.project, parts: [sheet] }, selection: ['s'] }))
    const st = () => useStore.getState()
    const sheetBox = () => box(st().project.parts.find((p) => p.id === 's')!)
    st().openFrame('s')
    const f0 = st().project.parts.find((p) => p.id === 's')!.frame!
    const legs = { profileId: 'konstruktion-45x95', placement: 'outside' as const, height: 918, side: 'short' as const }
    st().applyFrame({ ...f0, legs })
    let ps = st().project.parts
    let legBoxes = ps.filter((p) => p.name.startsWith('Ben')).map(box)
    // Outside the ends (x < 0 and x > 1800), 45 thick along x, 95 wide along z, flush with the long sides
    expect(legBoxes.map((l) => [l.min[0], l.max[0]])).toEqual([[-45, 0], [1800, 1845], [-45, 0], [1800, 1845]])
    expect(legBoxes.map((l) => [l.min[2], l.max[2]])).toEqual([[0, 95], [0, 95], [505, 600], [505, 600]])
    for (const p of ps) expect(overlapsOf(p, ps)).toEqual([])
    // Cover: the sheet grows 45 mm at each end, the frame stays put
    st().applyFrame({ ...f0, legs: { ...legs, cover: true } })
    expect([sheetBox().min[0], sheetBox().max[0], sheetBox().min[2], sheetBox().max[2]]).toEqual([-45, 1845, 0, 600])
    ps = st().project.parts
    const rails = ps.filter((p) => p.name.startsWith('Långregel')).map(box)
    expect([rails[0].min[0], rails[0].max[0]]).toEqual([0, 1800])
    for (const p of ps) expect(overlapsOf(p, ps)).toEqual([])
    // Switch to the long sides: the cover moves from the ends to the sides
    st().applyFrame({ ...f0, legs: { ...legs, cover: true, side: 'long' } })
    expect([sheetBox().min[0], sheetBox().max[0], sheetBox().min[2], sheetBox().max[2]]).toEqual([0, 1800, -45, 645])
    legBoxes = st().project.parts.filter((p) => p.name.startsWith('Ben')).map(box)
    expect(legBoxes[0].min[2]).toBe(-45)
  })

  it('seams still land on the joists when the sheet covers end legs', () => {
    const f = { profileId: 'konstruktion-45x70', joists: 2, onEdge: true, axis: 0 as const, seams: [1],
      legs: { profileId: 'konstruktion-45x95', placement: 'outside' as const, height: 918, side: 'short' as const, cover: true } }
    const grown: Part = { ...sheet, length: 1890, position: [-45, 900, 0], frame: f }
    const joist = frameUnder(grown, f).parts.filter((p) => p.role === 'Tvärregel').map(box)[0]
    const seamX = box(grown).min[0] + seamOffsets(grown)[0]
    expect(seamX).toBeGreaterThan(joist.min[0])
    expect(seamX).toBeLessThan(joist.max[0])
  })
})

describe('store: stretching a sheet with frame and legs', () => {
  beforeEach(() => useStore.getState().newProject())

  for (const placement of ['inside', 'outside', 'under', 'merged'] as const) {
    it(`${placement}: legs stay in the corners when the whole build is stretched`, () => {
      useStore.setState((s) => ({ project: { ...s.project, parts: [sheet] }, selection: ['s'] }))
      const st = () => useStore.getState()
      st().openFrame('s')
      st().applyFrame({ ...st().project.parts.find((p) => p.id === 's')!.frame!, legs: { profileId: 'konstruktion-45x95', placement, height: 900 } })
      st().closeFrame()
      const check = (w: number, d: number, h: number) => {
        const ps = st().project.parts
        const all = ps.map(box)
        const outer = { min: [0, 1, 2].map((i) => Math.min(...all.map((b) => b.min[i]))), max: [0, 1, 2].map((i) => Math.max(...all.map((b) => b.max[i]))) }
        expect(outer.max[0] - outer.min[0]).toBe(w)
        expect(outer.max[2] - outer.min[2]).toBe(d)
        expect(outer.max[1]).toBe(h)
        const sb = box(ps.find((p) => p.id === 's')!)
        const legs = ps.filter((p) => p.name.startsWith('Ben')).map(box)
        expect(legs).toHaveLength(4)
        // Each leg is at a corner: touching the sheet's (or frame's) end along x
        for (const l of legs) {
          expect(l.min[1]).toBe(0)
          const nearX = Math.min(Math.abs(l.min[0] - sb.min[0]), Math.abs(l.max[0] - sb.max[0]))
          expect(nearX).toBeLessThanOrEqual(placement === 'inside' ? 45 : 0)
        }
        for (const p of ps) expect(overlapsOf(p, ps)).toEqual([])
      }
      // Select the whole group (sheet + frame) and stretch it
      st().select(st().project.parts.map((p) => p.id))
      const before = st().project.parts.map(box)
      const w0 = Math.max(...before.map((b) => b.max[0])) - Math.min(...before.map((b) => b.min[0]))
      const d0 = Math.max(...before.map((b) => b.max[2])) - Math.min(...before.map((b) => b.min[2]))
      st().resizeSelection(0, w0 + 600)
      check(w0 + 600, d0, 900)
      st().resizeSelection(2, d0 + 100)
      check(w0 + 600, d0 + 100, 900)
      st().resizeSelection(1, 750)
      check(w0 + 600, d0 + 100, 750)
    })
  }
})
