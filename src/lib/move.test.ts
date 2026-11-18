import { describe, expect, it } from 'vitest'
import { moveNextTo, moveToFloor } from './move'
import type { Part, Vec3 } from './types'

// Sill along X: x 0..1200, y 0..45, z 0..95
const sill: Part = { id: 's', name: 'Syll', profileId: 'konstruktion-45x95', length: 1200, position: [0, 0, 0], rotation: [0, 0, 0] }
// A post lying somewhere else: 45 wide (x), 1000 tall (y), 95 deep (z)
const post = { min: [3000, 0, 500] as Vec3, max: [3045, 1000, 595] as Vec3 }
const apply = (b: typeof post, d: Vec3) => ({ min: b.min.map((v, i) => v + d[i]), max: b.max.map((v, i) => v + d[i]) })

describe('moveNextTo', () => {
  it('stands the selection on top of the sill at its end, flush', () => {
    const { delta, anchor } = moveNextTo(post, sill, [1180, 45, 40], [0, 1, 0])
    expect(anchor).toBe('end')
    expect(apply(post, delta)).toEqual({ min: [1155, 45, 0], max: [1200, 1045, 95] })
  })

  it('centres it on the sill', () => {
    const { delta } = moveNextTo(post, sill, [590, 45, 40], [0, 1, 0])
    expect(apply(post, delta).min[0]).toBe(577.5)
  })

  it('puts it against the front face', () => {
    const { delta } = moveNextTo(post, sill, [20, 20, 95], [0, 0, 1])
    const b = apply(post, delta)
    expect(b.min[2]).toBe(95)
    expect(b.min[0]).toBe(0)
  })
})

describe('moveToFloor', () => {
  it('sets the selection on the floor centred on the tap', () => {
    const lifted = { min: [0, 300, 0] as Vec3, max: [100, 345, 100] as Vec3 }
    expect(apply(lifted, moveToFloor(lifted, [500, 0, 500]))).toEqual({ min: [450, 0, 450], max: [550, 45, 550] })
  })
})
