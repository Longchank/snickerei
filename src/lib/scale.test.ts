import { describe, expect, it } from 'vitest'
import { faceFromNormal, scaleBy, scaleFaces, scaleTarget, scaleTo, sizeAlong } from './scale'
import type { Part } from './types'
import { partBox, toAxisBox } from './geometry'

const board = (over: Partial<Part> = {}): Part =>
  ({ id: 'b', name: 'B', profileId: 'konstruktion-45x95', length: 1000, position: [0, 0, 0], rotation: [0, 0, 0], ...over }) as Part

describe('Skala', () => {
  it('a board only grows along its length; a sheet along length and width', () => {
    expect(scaleFaces(board()).map((f) => f.axis)).toEqual([0, 0])
    const sheet = { ...board(), profileId: 'plywood-18', width: 600 } as Part
    expect([...new Set(scaleFaces(sheet).map((f) => f.axis))].sort()).toEqual([0, 2])
    expect(faceFromNormal(board(), [0, 1, 0])).toBeNull() // the top of a lying board: its thickness
    expect(faceFromNormal(board(), [1, 0, 0])).toEqual({ axis: 0, side: 1 })
  })

  it('moves the tapped end, the other end stays', () => {
    const b = board()
    const longer = scaleTo(b, { axis: 0, side: 1 }, 1500)
    expect(sizeAlong(longer, 0)).toBe(1500)
    expect(longer.position[0]).toBe(0)
    const fromStart = scaleTo(b, { axis: 0, side: 0 }, -200)
    expect(sizeAlong(fromStart, 0)).toBe(1200)
    expect(fromStart.position[0]).toBe(-200)
    expect(sizeAlong(scaleBy(b, { axis: 0, side: 1 }, -100), 0)).toBe(900)
    // Never through the other end
    expect(sizeAlong(scaleTo(b, { axis: 0, side: 1 }, -50), 0)).toBe(10)
  })

  it('a tap on another part: its parallel face, or its near side; the floor for a downward end', () => {
    const b = board()
    const post = board({ id: 'p', position: [1500, 0, 0], rotation: [0, 0, 1] }) // standing at x 1500..1545
    const near = toAxisBox(partBox(post)).min[0]
    expect(scaleTarget(b, { axis: 0, side: 1 }, [near, 300, 40], [-1, 0, 0], post)).toBe(near)
    expect(scaleTarget(b, { axis: 0, side: 1 }, [near + 20, 300, 95], [0, 0, 1], post)).toBe(near)
    const standing = board({ rotation: [0, 0, 1], position: [0, 500, 0] })
    expect(scaleTarget(standing, { axis: 1, side: 0 }, [300, 0, 300], null, null)).toBe(0)
  })
})

describe('nearestFace', () => {
  it('a tap anywhere on a board picks the nearer end', async () => {
    const { nearestFace } = await import('./scale')
    const b = { id: 'b', name: 'B', profileId: 'konstruktion-45x95', length: 1000, position: [0, 0, 0], rotation: [0, 0, 0] } as Part
    expect(nearestFace(b, [800, 45, 40])).toEqual({ axis: 0, side: 1 })
    expect(nearestFace(b, [100, 45, 40])).toEqual({ axis: 0, side: 0 })
  })
})
