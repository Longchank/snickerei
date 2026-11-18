/**
 * Corners where two boards meet end to end. Setting an end cut on one board
 * of such a corner makes the two ends match: a miter on both (each running to
 * the outer corner, cut along the diagonal) or a square butt joint.
 */
import { Euler, Vector3 } from 'three'
import { getProfile } from './catalog'
import { miterCorner } from './cuts'
import { eulerOf, partBox, round, toAxisBox, type AxisBox } from './geometry'
import { intersect, toLocalBox } from './joints'
import type { EndCut, Part, Vec3 } from './types'

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




/**
 * Lengthen (d > 0) or shorten (d < 0) a part at one end, keeping the other
 * end in place. Only for re-cutting butt joints (below): everywhere else a
 * cut never changes a board's length.
 */
export function extendEnd(p: Part, end: 0 | 1, d: number): Part {
  if (Math.abs(d) < 0.01) return p
  const length = round(p.length + d)
  if (end === 1) return { ...p, length }
  // Growing at the start moves the part's origin back along its length
  const dir = lengthDir(p).multiplyScalar(-d)
  return {
    ...p,
    length,
    position: [round(p.position[0] + dir.x), round(p.position[1] + dir.y), round(p.position[2] + dir.z)],
    notches: p.notches?.map((n) => ({
      ...n,
      min: [n.min[0] + d, n.min[1], n.min[2]] as Vec3,
      max: [n.max[0] + d, n.max[1], n.max[2]] as Vec3,
    })),
  }
}

/** Two boards meeting end to end in a square corner */
export interface ButtCorner {
  a: string
  ae: 0 | 1
  b: string
  be: 0 | 1
}

/** Does this end of `p` run through to the far side of `other` (the outer corner)? */
function runsThrough(p: Part, end: 0 | 1, other: Part): boolean {
  return Math.abs(reach(p, end, farSide(p, end, box(other), lengthAxis(p)))) < 0.5
}

/** The two ends where boards a and b meet at a corner, or null. */
export function cornerEnds(a: Part, b: Part): { ae: 0 | 1; be: 0 | 1 } | null {
  for (const ae of [0, 1] as const) {
    const partner = findCornerPartner(a, ae, [a, b])
    if (partner) return { ae, be: partner.end }
  }
  return null
}

const isSquare = (p: Part, end: 0 | 1) => !p.ends?.[end]?.angle

/**
 * The frame the seed boards belong to: every square corner reachable from
 * them through boards meeting end to end. Mitered corners don't count.
 */
export function frameCorners(seedIds: string[], parts: Part[]): ButtCorner[] {
  const byId = new Map(parts.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const queue = seedIds.filter((id) => byId.has(id))
  const corners: ButtCorner[] = []
  const keys = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    const p = byId.get(id)!
    if (getProfileKind(p) === 'sheet') continue
    for (const end of [0, 1] as const) {
      const partner = findCornerPartner(p, end, parts)
      if (!partner || getProfileKind(partner.part) === 'sheet') continue
      if (!isSquare(p, end) || !isSquare(partner.part, partner.end)) continue
      const key = [`${p.id}:${end}`, `${partner.part.id}:${partner.end}`].sort().join('|')
      if (!keys.has(key)) {
        keys.add(key)
        corners.push({ a: p.id, ae: end, b: partner.part.id, be: partner.end })
      }
      queue.push(partner.part.id)
    }
  }
  return corners
}

/**
 * Re-cut one square corner so `runner` runs through to the outer corner and
 * `stopper` ends against it. The outer corner and both boards' far ends stay
 * where they are — the boards get longer or shorter instead (owner
 * 2026-11-18: switching butt joints keeps the outer size).
 */
export function recutButt(runner: Part, re: 0 | 1, stopper: Part, se: 0 | 1): [Part, Part] {
  const a = lengthAxis(runner)
  const b = lengthAxis(stopper)
  // The outer corner, along each board, is the further of the two boards' extents
  const rBox = box(runner)
  const sBox = box(stopper)
  const rOuter = endCoord(runner, re) === rBox.max[a] ? Math.max(rBox.max[a], sBox.max[a]) : Math.min(rBox.min[a], sBox.min[a])
  const sOuter = endCoord(stopper, se) === sBox.max[b] ? Math.max(sBox.max[b], rBox.max[b]) : Math.min(sBox.min[b], rBox.min[b])
  const r2 = extendEnd(runner, re, reach(runner, re, rOuter))
  // The stopper first reaches the outer corner too, then stops at the runner's near side
  const s1 = extendEnd(stopper, se, reach(stopper, se, sOuter))
  const rb = box(r2)
  const sAtMax = endCoord(s1, se) === box(s1).max[b]
  const s2 = extendEnd(s1, se, reach(s1, se, sAtMax ? rb.min[b] : rb.max[b]))
  return [r2, s2]
}

/** "de stående", "de som går vänster–höger" … for the boards along one axis */
export const AXIS_BOARDS = ['de som går vänster–höger', 'de stående', 'de som går framåt–bakåt']

export interface ButtSwitch {
  parts: Part[]
  /** The corners that were switched */
  corners: ButtCorner[]
  /** For a whole frame: the axis whose boards now run through */
  axis?: 0 | 1 | 2
}

/** Which axis should run through after switching a frame: the one that mostly stops now */
function targetAxis(corners: ButtCorner[], byId: Map<string, Part>): 0 | 1 | 2 | null {
  const score = [0, 0, 0]
  const present = [false, false, false]
  for (const c of corners) {
    const a = byId.get(c.a)!
    const b = byId.get(c.b)!
    const aRuns = runsThrough(a, c.ae, b)
    const bRuns = runsThrough(b, c.be, a)
    for (const [p, runs] of [[a, aRuns], [b, bRuns]] as const) {
      const ax = lengthAxis(p)
      present[ax] = true
      if (!runs) score[ax]++
      else score[ax]--
    }
  }
  const order: (0 | 1 | 2)[] = [1, 0, 2] // ties: standing boards first
  let best: 0 | 1 | 2 | null = null
  for (const ax of order) if (present[ax] && (best === null || score[ax] > score[best])) best = ax
  return best
}

/**
 * ⇄ Byt stötfog. Two selected boards that share a square corner: switch that
 * corner. Otherwise: the whole frame of the selection — every square corner
 * gets the boards along one axis running through (the axis that mostly
 * stops now), so "top/bottom through" becomes "sides through" and back.
 * Null when there's no square corner to switch.
 */
export function switchButtJoints(selection: string[], parts: Part[]): ButtSwitch | null {
  const byId = new Map(parts.map((p) => [p.id, p]))
  const sel = selection.map((id) => byId.get(id)).filter((p): p is Part => !!p)
  const apply = (corners: ButtCorner[], pickRunner: (a: Part, b: Part, c: ButtCorner) => boolean) => {
    for (const c of corners) {
      const a = byId.get(c.a)!
      const b = byId.get(c.b)!
      const [r, re, st, se] = pickRunner(a, b, c) ? [a, c.ae, b, c.be] : [b, c.be, a, c.ae]
      const [r2, s2] = recutButt(r, re, st, se)
      if (r2.length < 1 || s2.length < 1) return false
      byId.set(r2.id, r2)
      byId.set(s2.id, s2)
    }
    return true
  }
  const result = (corners: ButtCorner[], axis?: 0 | 1 | 2): ButtSwitch => ({
    parts: parts.map((p) => byId.get(p.id)!),
    corners,
    axis,
  })

  if (sel.length === 2) {
    const ends = cornerEnds(sel[0], sel[1])
    if (ends && isSquare(sel[0], ends.ae) && isSquare(sel[1], ends.be)) {
      const c: ButtCorner = { a: sel[0].id, ae: ends.ae, b: sel[1].id, be: ends.be }
      // Toggle: the board that runs through now becomes the one that stops
      const aRuns = runsThrough(sel[0], ends.ae, sel[1])
      return apply([c], () => !aRuns) ? result([c]) : null
    }
  }
  const corners = frameCorners(selection, parts)
  if (!corners.length) return null
  const axis = targetAxis(corners, byId)
  if (axis === null) return null
  const ok = apply(corners, (a, b, c) => {
    if (lengthAxis(a) === axis) return true
    if (lengthAxis(b) === axis) return false
    // A corner without that axis: just toggle it
    return !runsThrough(a, c.ae, b)
  })
  return ok ? result(corners, axis) : null
}

/** Old two-board API, kept for callers and tests: switch the corner a and b share. */
export function switchButt(a: Part, b: Part): [Part, Part] | null {
  const r = switchButtJoints([a.id, b.id], [a, b])
  if (!r || r.axis !== undefined) return null
  return [r.parts[0], r.parts[1]]
}

const getProfileKind = (p: Part) => getProfile(p.profileId).kind
