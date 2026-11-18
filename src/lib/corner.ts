/**
 * Corners where two boards meet end to end. Setting an end cut on one board
 * of such a corner makes the two ends match: a miter on both (each running to
 * the outer corner, cut along the diagonal) or a square butt joint.
 */
import { Euler, Vector3 } from 'three'
import { miterCorner } from './cuts'
import { eulerOf, partBox, round, toAxisBox, type AxisBox } from './geometry'
import { intersect, toLocalBox } from './joints'
import type { EndCut, Part } from './types'

/** How close (mm) two boards must be to count as meeting */
const TOL = 2

type Axis = 0 | 1 | 2
const box = (p: Part) => toAxisBox(partBox(p))

/** World direction of the part's length (local +x) */
function lengthDir(p: Part): Vector3 {
  return new Vector3(1, 0, 0).applyEuler(new Euler().copy(eulerOf(p.rotation)))
}

function lengthAxis(p: Part): Axis {
  const d = lengthDir(p)
  const c = [Math.abs(d.x), Math.abs(d.y), Math.abs(d.z)]
  return c.indexOf(Math.max(...c)) as Axis
}

/** World coordinate, along the part's length axis, of one of its ends */
function endCoord(p: Part, end: 0 | 1): number {
  const a = lengthAxis(p)
  const sign = lengthDir(p).getComponent(a) > 0 ? 1 : -1
  const b = box(p)
  // local x = 0 is at the min side when the length points the + way
  return (end === 0) === sign > 0 ? b.min[a] : b.max[a]
}

/**
 * Slide a part along its length so that one end moves outwards by d (inwards
 * if negative). The length never changes: a cut comes off the end, it doesn't
 * add wood (owner 2026-11-18: "1 meter is still 1 meter after being cut").
 */
export function slideEnd(p: Part, end: 0 | 1, d: number): Part {
  if (Math.abs(d) < 0.01) return p
  const dir = lengthDir(p).multiplyScalar(end === 1 ? d : -d)
  return { ...p, position: [round(p.position[0] + dir.x), round(p.position[1] + dir.y), round(p.position[2] + dir.z)] }
}

const near = (v: number, lo: number, hi: number) => v >= lo - TOL && v <= hi + TOL

export interface CornerPartner {
  part: Part
  end: 0 | 1
}

/**
 * Another board whose end meets this board's `end` at a corner: their
 * lengths run in different directions, each end lies within (or against)
 * the other board, and they overlap in the third direction. A board whose
 * end only meets the middle of another (a T) is not a corner.
 */
export function findCornerPartner(p: Part, end: 0 | 1, parts: Part[]): CornerPartner | null {
  const a = lengthAxis(p)
  const pBox = box(p)
  const pEnd = endCoord(p, end)
  let best: (CornerPartner & { d: number }) | null = null
  for (const q of parts) {
    if (q.id === p.id || (p.rip && q.rip?.id === p.rip.id)) continue
    const b = lengthAxis(q)
    if (b === a) continue
    const qBox = box(q)
    if (!near(pEnd, qBox.min[a], qBox.max[a])) continue
    const c = ([0, 1, 2] as Axis[]).find((x) => x !== a && x !== b)!
    if (Math.min(pBox.max[c], qBox.max[c]) - Math.max(pBox.min[c], qBox.min[c]) <= 0.5) continue
    for (const qe of [0, 1] as const) {
      const qEnd = endCoord(q, qe)
      if (!near(qEnd, pBox.min[b], pBox.max[b])) continue
      // Prefer the board whose end sits closest
      const d = Math.abs(qEnd - (pBox.min[b] + pBox.max[b]) / 2)
      if (!best || d < best.d) best = { part: q, end: qe, d }
    }
  }
  return best ? { part: best.part, end: best.end } : null
}

/** How far to move an end so it reaches `target` (positive = outwards) */
function reach(p: Part, end: 0 | 1, target: number): number {
  const a = lengthAxis(p)
  const b = box(p)
  const atMax = endCoord(p, end) === b.max[a]
  return atMax ? target - b.max[a] : b.min[a] - target
}

function setEnd(p: Part, end: 0 | 1, cut: EndCut | null): Part {
  const ends = [...(p.ends ?? [null, null])] as [EndCut | null, EndCut | null]
  ends[end] = cut
  return { ...p, ends: ends.some(Boolean) ? ends : undefined }
}

/** Far side of `other` along `axis`, seen from the end of `p` that meets it */
function farSide(p: Part, end: 0 | 1, other: AxisBox, axis: Axis): number {
  const a = lengthAxis(p)
  const atMax = endCoord(p, end) === box(p).max[a]
  return atMax ? other.max[axis] : other.min[axis]
}

/**
 * A mitered corner: both boards reach the outer corner and are cut along the
 * diagonal, so the ends meet. The angle follows from the boards' widths. A
 * board that stops short is slid out to the corner, never lengthened.
 */
export function cornerMiter(p: Part, pe: 0 | 1, partner: CornerPartner): [Part, Part] | null {
  const q = partner.part
  const qe = partner.end
  const a = lengthAxis(p)
  const b = lengthAxis(q)
  const pBox = box(p)
  const qBox = box(q)
  let p2 = setEnd(p, pe, null)
  let q2 = setEnd(q, qe, null)
  p2 = slideEnd(p2, pe, reach(p2, pe, farSide(p, pe, qBox, a)))
  q2 = slideEnd(q2, qe, reach(q2, qe, farSide(q, qe, pBox, b)))
  const overlap = intersect(box(p2), box(q2))
  if (!overlap) return null
  return miterCorner(p2, q2, overlap, toLocalBox)
}

/**
 * A square butt joint: `p` runs through to the outer corner and the partner
 * is slid back to end against it. Both ends square, lengths unchanged.
 */
export function cornerButt(p: Part, pe: 0 | 1, partner: CornerPartner): [Part, Part] {
  const q = partner.part
  const qe = partner.end
  const a = lengthAxis(p)
  const b = lengthAxis(q)
  let p2 = setEnd(p, pe, null)
  let q2 = setEnd(q, qe, null)
  p2 = slideEnd(p2, pe, reach(p2, pe, farSide(p, pe, box(q), a)))
  // The partner ends at the near side of p
  const pBox = box(p2)
  const qAtMax = endCoord(q2, qe) === box(q2).max[b]
  const target = qAtMax ? pBox.min[b] : pBox.max[b]
  q2 = slideEnd(q2, qe, reach(q2, qe, target))
  return [p2, q2]
}

