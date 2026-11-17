import { describe, expect, it } from 'vitest'
import { chooseSnaps, DEFAULT_SNAP_TYPES, pointCandidates, snapMove } from './snap'
import type { Vec3 } from './types'

const box = (min: Vec3, max: Vec3) => ({ min, max })
// Looking straight down the y axis: screen x = world x, screen y = world z (1 px per mm)
const topDown = (p: Vec3): [number, number] => [p[0], p[2]]

describe('point snapping (measuring)', () => {
  // A 45x95 board lying flat: x 0..1000, y 0..45, z 0..95; tapped on its top face
  const board = box([0, 0, 0], [1000, 45, 95])
  const cands = (hit: Vec3) => pointCandidates(board, hit, 1)

  it('snaps to a corner near the tap', () => {
    const hit: Vec3 = [8, 45, 6]
    const [first] = chooseSnaps(cands(hit), hit, topDown, [8, 6], 20, DEFAULT_SNAP_TYPES)
    expect(first).toEqual({ kind: 'vertex', point: [0, 45, 0] })
  })

  it('snaps to the middle of an edge, then lets you pick the plain spot', () => {
    const hit: Vec3 = [505, 45, 90]
    const options = chooseSnaps(cands(hit), hit, topDown, [505, 90], 20, DEFAULT_SNAP_TYPES)
    expect(options[0]).toEqual({ kind: 'edgeMid', point: [500, 45, 95] })
    expect(options.map((o) => o.kind)).toContain('edge')
    expect(options[options.length - 1]).toEqual({ kind: 'face', point: hit })
  })

  it('offers the face centre and the part centre in the middle', () => {
    const hit: Vec3 = [498, 45, 50]
    const options = chooseSnaps(cands(hit), hit, topDown, [498, 50], 20, DEFAULT_SNAP_TYPES)
    expect(options.slice(0, 2)).toEqual([
      { kind: 'faceCenter', point: [500, 45, 47.5] },
      { kind: 'center', point: [500, 22.5, 47.5] },
    ])
  })

  it('respects switched-off snap types', () => {
    const hit: Vec3 = [8, 45, 6]
    const options = chooseSnaps(cands(hit), hit, topDown, [8, 6], 20, { ...DEFAULT_SNAP_TYPES, vertex: false })
    expect(options[0].kind).not.toBe('vertex')
  })

  it('uses the face the tap was on', () => {
    // Tapped on the bottom face
    const c = pointCandidates(board, [500, 0, 50], 1).find((x) => x.kind === 'faceCenter')
    expect(c?.point).toEqual([500, 0, 47.5])
  })
})

describe('snapMove (moving parts)', () => {
  const plank = box([0, 0, 0], [1000, 45, 95])

  it('snaps faces together like before', () => {
    const moving = box([1010, 0, 0], [1100, 45, 95])
    expect(snapMove(moving, [plank], [true, false, false], 20).offset).toEqual([-10, 0, 0])
  })

  it('centres a part on another', () => {
    // A 100 wide block whose centre is 8 mm off the plank's centre (500)
    const moving = box([458, 45, 0], [558, 90, 95])
    const { offset, guides } = snapMove(moving, [plank], [true, false, false], 20)
    expect(offset).toEqual([-8, 0, 0])
    expect(guides).toEqual([{ axis: 0, kind: 'center', from: [500, 67.5, 47.5], to: [500, 22.5, 47.5] }])
  })

  it('can switch centre snapping off', () => {
    const moving = box([458, 45, 0], [558, 90, 95])
    const types = { ...DEFAULT_SNAP_TYPES, center: false }
    expect(snapMove(moving, [plank], [true, false, false], 20, types).offset).toEqual([0, 0, 0])
  })
})
