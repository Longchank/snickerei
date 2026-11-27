import { describe, expect, it } from 'vitest'
import { countDone, isLocked, toggleCheck } from './progress'

describe('workshop progress', () => {
  it('checks off and counts what is done', () => {
    const keys = ['a', 'b', 'c']
    let c = toggleCheck(undefined, 'cut', keys[1])
    expect(countDone(c, 'cut', keys)).toBe(1)
    c = toggleCheck(c, 'cut', keys[1])
    expect(countDone(c, 'cut', keys)).toBe(0)
  })

  it('locks the model while a piece is checked off as cut', () => {
    expect(isLocked({})).toBe(false)
    expect(isLocked({ checks: { buy: ['x'], steps: ['g'] } })).toBe(false)
    expect(isLocked({ checks: { cut: ['x#0'] } })).toBe(true)
  })
})

describe('store: the model is locked while cutting', () => {
  it('blocks changes and undo, asks before drawing again, and unlocking empties the cut list', async () => {
    const { useStore } = await import('./store')
    const s = useStore.getState
    s().newProject()
    s().setMode('skissa')
    s().addPart('konstruktion-45x95')
    const id = s().project.parts[0].id
    s().setMode('verkstad')
    s().toggleCheck('buy', 'x')
    s().toggleCheck('cut', 'piece#0')
    // Changing the model asks to unlock instead
    s().updatePart(id, { length: 500 })
    expect(s().project.parts[0].length).not.toBe(500)
    expect(s().lockPrompt).toEqual({})
    s().undo()
    expect(s().project.parts).toHaveLength(1)
    s().closeLockPrompt()
    // Going back to Skissa asks first; "Bara titta" switches without unlocking
    s().setMode('skissa')
    expect(s().settings.mode).toBe('verkstad')
    expect(s().lockPrompt).toEqual({ mode: 'skissa' })
    s().setMode('skissa', true)
    expect(s().settings.mode).toBe('skissa')
    expect(s().lockPrompt).toBeNull()
    // Handla is fine while locked
    s().setMode('handla')
    expect(s().settings.mode).toBe('handla')
    // Unlocking empties only the cut list
    s().unlockModel()
    expect(s().project.checks).toEqual({ buy: ['x'], cut: [] })
    s().updatePart(id, { length: 500 })
    expect(s().project.parts[0].length).toBe(500)
  })
})

describe('old cut checks', () => {
  it('are dropped on load, so they cannot lock the model', async () => {
    const { normalizeProject } = await import('./store')
    const p = normalizeProject({ parts: [], checks: { cut: ['konstruktion-45x95|812||#0', 'a'], buy: ['x|1'] } } as never)
    expect(p.checks).toEqual({ cut: ['a'], buy: ['x|1'] })
  })
})

describe('cutSchedule', () => {
  it('ties every cut in the diagram to a piece of the model', async () => {
    const { cutSchedule, purchasePlan } = await import('./cutlist')
    const at = (id: string, length: number, extra = {}) =>
      ({ id, name: id, profileId: 'konstruktion-45x95', length, position: [0, 0, 0], rotation: [0, 0, 0], ...extra }) as never
    const parts = [at('a', 1200), at('b', 1200), at('c', 420), at('d', 420), at('long', 9000)]
    const plan = purchasePlan(parts, [], 3)
    const [sec] = cutSchedule(parts, plan)
    const placed = sec.stocks.flatMap((s) => s.pieces)
    expect(placed.map((p) => p.key).sort()).toEqual(['a', 'b', 'c', 'd'])
    // Each stock board's pieces follow its cuts
    for (const s of sec.stocks) expect(s.pieces.map((p) => p.length)).toEqual(s.board!.cuts)
    expect(sec.oversize.map((p) => p.key)).toEqual(['long'])
    expect(placed.find((p) => p.key === 'c')!.partIds).toEqual(['c'])
  })

  it('matches sheet pieces whichever way they were turned on the sheet', async () => {
    const { cutSchedule, purchasePlan } = await import('./cutlist')
    const sheet = (id: string, length: number, width: number) =>
      ({ id, name: id, profileId: 'plywood-18', length, width, position: [0, 0, 0], rotation: [0, 0, 0] }) as never
    const parts = [sheet('top', 1200, 600), sheet('side', 400, 700)]
    const [sec] = cutSchedule(parts, purchasePlan(parts, [], 3))
    expect(sec.stocks.flatMap((s) => s.pieces.map((p) => p.key)).sort()).toEqual(['side', 'top'])
    expect(sec.oversize).toEqual([])
  })
})
