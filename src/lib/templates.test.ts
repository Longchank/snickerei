import { describe, expect, it } from 'vitest'
import { buildTemplate, clampSize } from './templates'
import { partBox, toAxisBox } from './geometry'
import type { Part } from './types'
const boxOf = (p: Part) => toAxisBox(partBox(p))

const outer = (parts: Part[]) => {
  const boxes = parts.map((p) => boxOf(p))
  return [0, 1, 2].map((i) => Math.round(Math.max(...boxes.map((b) => b.max[i])) - Math.min(...boxes.map((b) => b.min[i]))))
}

describe('templates', () => {
  it('builds a bench of the asked outer size, grouped Ram + Ben, top loose, purpose set', () => {
    const p = buildTemplate('bank', [1500, 380, 460], 'Altanbänk')
    expect(p.name).toBe('Altanbänk')
    expect(p.purpose).toBe('bank')
    const [L, H, D] = outer(p.parts)
    expect([L, D, H]).toEqual([1500, 380, 460])
    expect(p.groups.map((g) => g.name)).toEqual(['Ram', 'Ben'])
    const legs = p.parts.filter((x) => x.name.startsWith('Ben'))
    expect(legs).toHaveLength(4)
    expect(new Set(legs.map((x) => x.groupId)).size).toBe(1)
    const top = p.parts.find((x) => x.name === 'Skiva')!
    expect(top.groupId).toBeUndefined()
    expect(top.frame).toBeDefined()
    // Nothing goes below the floor
    expect(Math.min(...p.parts.map((x) => boxOf(x).min[1]))).toBeGreaterThanOrEqual(0)
  })

  it('builds a table and keeps sizes within limits', () => {
    const p = buildTemplate('bord', [1800, 900, 740])
    expect(p.name).toBe('Bord')
    expect(p.purpose).toBe('bord')
    const [L, H, D] = outer(p.parts)
    expect([L, D, H]).toEqual([1800, 900, 740])
    expect(clampSize([10, 99999, NaN])).toEqual([300, 1200, 200])
  })
})

describe('store: the project list', () => {
  it('saves the open project when leaving it, opens others, and removes them', async () => {
    const { useStore } = await import('./store')
    const s = useStore.getState
    useStore.setState({ library: {}, currentId: null })
    s().newProject()
    s().createProject(buildTemplate('bank', [1200, 400, 450]))
    const bench = s().currentId!
    expect(s().home).toBe(false)
    expect(s().settings.mode).toBe('skissa')
    s().setMode('handla')
    // A second project: the bench is saved to the list, in the step it was left in
    s().createProject(buildTemplate('bord', [1200, 800, 750], 'Köksbord'))
    const table = s().currentId!
    expect(s().library[bench].project.name).toBe('Bänk')
    expect(s().library[bench].mode).toBe('handla')
    s().goHome()
    expect(s().home).toBe(true)
    expect(Object.keys(s().library).sort()).toEqual([bench, table].sort())
    s().openProject(bench)
    expect(s().project.name).toBe('Bänk')
    expect(s().settings.mode).toBe('handla')
    expect(s().past).toEqual([])
    s().deleteProject(table)
    expect(Object.keys(s().library)).toEqual([bench])
    s().deleteProject(bench)
    expect(s().currentId).toBeNull()
    expect(s().project.parts).toEqual([])
  })
})
