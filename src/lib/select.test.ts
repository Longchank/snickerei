import { describe, expect, it } from 'vitest'
import { similarChoices } from './select'
import type { Part } from './types'

const p = (id: string, profileId: string, length: number): Part => ({ id, name: id, profileId, length, position: [0, 0, 0], rotation: [0, 0, 0] })
const parts = [p('a', 'konstruktion-45x95', 600), p('b', 'konstruktion-45x95', 600), p('c', 'konstruktion-45x95', 900), p('d', 'konstruktion-45x70', 600)]

describe('similarChoices', () => {
  it('offers the same size, then the whole profile', () => {
    expect(similarChoices([parts[0]], parts)).toEqual([
      { kind: 'size', ids: ['a', 'b'] },
      { kind: 'profile', ids: ['a', 'b', 'c'] },
    ])
  })
  it('offers nothing for mixed profiles, and skips choices that add nothing', () => {
    expect(similarChoices([parts[0], parts[3]], parts)).toEqual([])
    expect(similarChoices([parts[3]], parts)).toEqual([])
    expect(similarChoices([parts[2]], parts)).toEqual([{ kind: 'profile', ids: ['a', 'b', 'c'] }])
  })
})
