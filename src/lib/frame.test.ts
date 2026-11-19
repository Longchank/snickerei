import { beforeEach, describe, expect, it } from 'vitest'
import { frameUnder, defaultJoists, isLyingSheet, joistSpacing } from './frame'
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
