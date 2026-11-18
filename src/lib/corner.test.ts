import { describe, expect, it } from 'vitest'
import { cornerButt, cornerMiter, findCornerPartner, frameCorners, switchButt, switchButtJoints } from './corner'
import { partBox, toAxisBox } from './geometry'
import { overlapsOf } from './joints'
import { placeOnPart } from './place'
import type { Part } from './types'

const box = (p: Part) => toAxisBox(partBox(p))
// The frame from tap-to-place: sill along X, a post standing on its end
const sill: Part = { id: 'sill', name: 'Syll', profileId: 'konstruktion-45x95', length: 1200, position: [0, 0, 0], rotation: [0, 0, 0] }
const post: Part = { ...placeOnPart('konstruktion-45x95', sill, [1180, 45, 40], [0, 1, 0], [sill]).part, id: 'post', name: 'Stolpe' }
const rail: Part = { id: 'rail', name: 'Regel', profileId: 'konstruktion-45x95', length: 600, position: [0, 500, 0], rotation: [0, 0, 0] }

describe('findCornerPartner', () => {
  it('finds the post standing on the end of the sill, and the sill from the post', () => {
    expect(box(post)).toEqual({ min: [1155, 45, 0], max: [1200, 1045, 95] })
    expect(findCornerPartner(sill, 1, [sill, post])).toMatchObject({ part: { id: 'post' } })
    const fromPost = findCornerPartner(post, 0, [sill, post])
    expect(fromPost?.part.id).toBe('sill')
    expect(fromPost?.end).toBe(1)
  })

  it('does not treat the other end or a T-junction as a corner', () => {
    expect(findCornerPartner(sill, 0, [sill, post])).toBeNull()
    // A rail whose end meets the middle of the post is a T, not a corner
    const tRail: Part = { ...rail, position: [555, 500, 0] }
    expect(findCornerPartner(tRail, 1, [tRail, post])).toBeNull()
  })
})

describe('cornerMiter', () => {
  it('slides the short board to the outer corner and miters both, keeping lengths', () => {
    const [s, p] = cornerMiter(sill, 1, { part: post, end: 0 })!
    // The post slides down to the floor (the outer corner); it doesn't grow
    expect(box(p)).toEqual({ min: [1155, 0, 0], max: [1200, 1000, 95] })
    expect(p.length).toBe(post.length)
    expect(s.length).toBe(sill.length)
    expect(box(s)).toEqual(box(sill))
    expect(Math.abs(s.ends![1]!.angle)).toBe(45)
    expect(Math.abs(p.ends![0]!.angle)).toBe(45)
    // The two cuts fit: no collision left at the corner
    expect(overlapsOf(s, [p])).toEqual([])
  })
})

describe('cornerButt', () => {
  it('lets one board run through and slides the other back against it', () => {
    const [s0, p0] = cornerMiter(sill, 1, { part: post, end: 0 })!
    // Back to square from the post's side: the post runs through, the sill stops at it
    const [p, s] = cornerButt(p0, 0, { part: s0, end: 1 })
    expect(p.ends).toBeUndefined()
    expect(s.ends).toBeUndefined()
    expect(box(p)).toEqual({ min: [1155, 0, 0], max: [1200, 1000, 95] })
    expect(box(s).max[0]).toBe(1155)
    expect(s.length).toBe(sill.length)
    expect(p.length).toBe(post.length)
    expect(overlapsOf(s, [p])).toEqual([])
  })
})

const outer = (ps: Part[]) => {
  const bs = ps.map(box)
  return { min: [0, 1, 2].map((i) => Math.min(...bs.map((b) => b.min[i]))), max: [0, 1, 2].map((i) => Math.max(...bs.map((b) => b.max[i]))) }
}

describe('switchButt (one corner)', () => {
  it('re-cuts the corner: the other board runs through, the outer corner stays, and back', () => {
    // The sill runs through; the post stands on it
    const [s1, p1] = switchButt(sill, post)!
    // Now the post runs to the floor (longer) and the sill stops against it (shorter)
    expect(box(p1)).toEqual({ min: [1155, 0, 0], max: [1200, 1045, 95] })
    expect(box(s1)).toEqual({ min: [0, 0, 0], max: [1155, 45, 95] })
    expect(p1.length).toBe(1045)
    expect(s1.length).toBe(1155)
    expect(outer([s1, p1])).toEqual(outer([sill, post]))
    expect(overlapsOf(s1, [p1])).toEqual([])
    // And back again (argument order doesn't matter)
    const [p2, s2] = switchButt(p1, s1)!
    expect(box(s2)).toEqual(box(sill))
    expect(box(p2)).toEqual(box(post))
  })

  it('does nothing for boards that do not meet at a corner, or a miter', () => {
    expect(switchButt(sill, { ...rail, position: [0, 2000, 0] })).toBeNull()
    const [ms, mp] = cornerMiter(sill, 1, { part: post, end: 0 })!
    expect(switchButt(ms, mp)).toBeNull()
  })
})

describe('switchButtJoints (whole frame)', () => {
  // A standing frame 1000 × 600: top and bottom run through, the sides stand between
  const b = (id: string, length: number, position: Part['position'], rotation: Part['rotation']): Part => ({
    id, name: id, profileId: 'konstruktion-45x95', length, position, rotation,
  })
  const bottom = b('bottom', 1000, [0, 0, 0], [0, 0, 0])
  const top = b('top', 1000, [0, 555, 0], [0, 0, 0])
  const left = b('left', 510, [45, 45, 0], [0, 0, 1])
  const right = b('right', 510, [1000, 45, 0], [0, 0, 1])
  const frame = [bottom, top, left, right]

  it('finds all four corners from any one board', () => {
    expect(frameCorners(['left'], frame)).toHaveLength(4)
    expect(frameCorners(['top'], frame)).toHaveLength(4)
  })

  it('switches every corner so the sides run through, keeping the outer size, and back', () => {
    const r = switchButtJoints(['left'], frame)!
    expect(r.axis).toBe(1) // the standing boards now run through
    const [bo, to, le, ri] = r.parts
    expect([le.length, ri.length]).toEqual([600, 600])
    expect([bo.length, to.length]).toEqual([910, 910])
    expect(outer(r.parts)).toEqual(outer(frame))
    for (const p of r.parts) expect(overlapsOf(p, r.parts)).toEqual([])
    // No corner came apart: still four corners
    expect(frameCorners(['left'], r.parts)).toHaveLength(4)
    // And back
    const back = switchButtJoints(['top'], r.parts)!
    expect(back.axis).toBe(0)
    expect(back.parts.map(box)).toEqual(frame.map(box))
  })

  it('two selected boards of the frame switch only their own corner', () => {
    const r = switchButtJoints(['bottom', 'right'], frame)!
    expect(r.corners).toHaveLength(1)
    const [bo, to, le, ri] = r.parts
    expect(ri.length).toBe(555) // runs down to the floor now
    expect(bo.length).toBe(955)
    expect([to.length, le.length]).toEqual([1000, 510]) // untouched
    expect(outer(r.parts)).toEqual(outer(frame))
  })
})
