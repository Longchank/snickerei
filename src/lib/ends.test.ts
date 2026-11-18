import { describe, expect, it } from 'vitest'
import { endName, endPoint } from './ends'
import type { Part } from './types'

const board = (rotation: Part['rotation'], position: Part['position'] = [0, 0, 0]): Part => ({
  id: 'b', name: 'b', profileId: 'konstruktion-45x95', length: 1000, position, rotation,
})

describe('end names', () => {
  it('names a lying board left/right and a post bottom/top', () => {
    const lying = board([0, 0, 0])
    expect([endName(lying, 0), endName(lying, 1)]).toEqual(['Vänstra', 'Högra'])
    expect(endPoint(lying, 1)).toEqual([1000, 22.5, 47.5])
    // Turned about Z: the length runs up
    const post = board([0, 0, 1], [45, 0, 0])
    expect([endName(post, 0), endName(post, 1)]).toEqual(['Nedre', 'Övre'])
    expect(endPoint(post, 0)[1]).toBe(0)
  })

  it('names a board along Z back/front', () => {
    const b = board([0, 1, 0])
    expect(new Set([endName(b, 0), endName(b, 1)])).toEqual(new Set(['Bakre', 'Främre']))
  })
})
