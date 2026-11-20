import { describe, expect, it } from 'vitest'
import { ASSEMBLY, buildSteps, isShown } from './steps'
import type { Part } from './types'

const p = (id: string, groupId?: string, hidden?: boolean): Part => ({
  id, name: id, profileId: 'konstruktion-45x95', length: 1000, position: [0, 0, 0], rotation: [0, 0, 0], groupId, hidden,
})

describe('steps', () => {
  const parts = [p('a', 'ram'), p('b', 'ram'), p('c', 'ben'), p('d')]
  const groups = [{ id: 'ram', name: 'Ram' }, { id: 'ben', name: 'Ben' }, { id: 'tom', name: 'Tom' }]

  it('one step per group with parts, in order, then Montering', () => {
    const steps = buildSteps(parts, groups)
    expect(steps.map((s) => s.title)).toEqual(['Ram', 'Ben', 'Montering'])
    expect(steps[2].id).toBe(ASSEMBLY)
  })

  it('a step shows only its parts; Montering shows all; hidden parts never show', () => {
    const [ram, , all] = buildSteps(parts, groups)
    expect(parts.filter((x) => isShown(x, ram)).map((x) => x.id)).toEqual(['a', 'b'])
    expect(parts.filter((x) => isShown(x, all)).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(isShown(p('e', undefined, true), null)).toBe(false)
  })
})
