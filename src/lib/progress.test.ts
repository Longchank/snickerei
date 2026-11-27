import { describe, expect, it } from 'vitest'
import { countDone, cutRowKey, isLocked, pieceKeys, toggleCheck } from './progress'
import type { CutRow } from './cutlist'

const row = { profile: { id: 'konstruktion-45x95' }, length: 812, count: 3, names: [], notes: ['Gering 45°'] } as unknown as CutRow

describe('workshop progress', () => {
  it('gives every piece its own key and counts what is done', () => {
    const keys = pieceKeys(row)
    expect(keys).toHaveLength(3)
    expect(keys[0]).toBe(`${cutRowKey(row)}#0`)
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
