import { describe, expect, it } from 'vitest'
import { cornerButt, cornerMiter, findCornerPartner } from './corner'
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
  it('runs both boards to the outer corner and miters them on the diagonal', () => {
    const [s, p] = cornerMiter(sill, 1, { part: post, end: 0 })!
    // The post now reaches down to the floor (the outer corner)
    expect(box(p)).toEqual({ min: [1155, 0, 0], max: [1200, 1045, 95] })
    expect(p.length).toBe(1045)
    expect(Math.abs(s.ends![1]!.angle)).toBe(45)
    expect(Math.abs(p.ends![0]!.angle)).toBe(45)
    // The two cuts fit: no collision left at the corner
    expect(overlapsOf(s, [p])).toEqual([])
  })
})

describe('cornerButt', () => {
  it('lets one board run through and shortens the other against it', () => {
    const [s0, p0] = cornerMiter(sill, 1, { part: post, end: 0 })!
    // Back to square from the post's side: the post runs through, the sill stops at it
    const [p, s] = cornerButt(p0, 0, { part: s0, end: 1 })
    expect(p.ends).toBeUndefined()
    expect(s.ends).toBeUndefined()
    expect(box(p)).toEqual({ min: [1155, 0, 0], max: [1200, 1045, 95] })
    expect(box(s).max[0]).toBe(1155)
    expect(overlapsOf(s, [p])).toEqual([])
  })
})
