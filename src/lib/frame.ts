/**
 * "Ram under skivan": build the framing under a lying sheet — two long
 * rails along its long sides, two end rails between them, and joists
 * (tvärreglar) evenly spaced across, all flush with the sheet's edges.
 */
import { getProfile } from './catalog'
import { partBox, round, toAxisBox } from './geometry'
import { rotationFor } from './place'
import { resizeAlong } from './resize'
import type { Part, SheetFrame, Vec3 } from './types'

type Axis = 0 | 1 | 2
const boxOf = (p: Part) => toAxisBox(partBox(p))

/** A lying sheet: thinnest along the height */
export function isLyingSheet(p: Part): boolean {
  if (getProfile(p.profileId).kind !== 'sheet') return false
  const b = boxOf(p)
  const s = [0, 1, 2].map((i) => b.max[i] - b.min[i])
  return s[1] <= Math.min(s[0], s[2])
}

/** Joists for a sensible spacing: at most ~600 mm between them */
export function defaultJoists(sheet: Part, maxSpacing = 600): number {
  const b = boxOf(sheet)
  const long = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2])
  return Math.max(0, Math.ceil(long / maxSpacing) - 1)
}

/** The board's height under the sheet and its width seen from above */
function section(f: SheetFrame): { height: number; plan: number } {
  const prof = getProfile(f.profileId)
  return f.onEdge ? { height: prof.width, plan: prof.thickness } : { height: prof.thickness, plan: prof.width }
}

/** A board along `axis` whose bounding box starts at `min`, on edge or flat */
function boardAt(profileId: string, length: number, axis: Axis, onEdge: boolean, min: Vec3): Omit<Part, 'id' | 'name'> {
  const across: Axis = axis === 0 ? 2 : 0
  const rotation = rotationFor(axis, onEdge ? 1 : across)
  const part = { profileId, length: round(length), position: [0, 0, 0] as Vec3, rotation }
  const b = boxOf({ ...part, id: '', name: '' })
  part.position = [0, 1, 2].map((i) => round(min[i] - b.min[i])) as Vec3
  return part
}

/** Centre-to-centre spacing of the joists (and end rails), mm */
export function joistSpacing(sheet: Part, f: SheetFrame): number {
  const b = boxOf(sheet)
  const long = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2])
  return (long - section(f).plan) / (f.joists + 1)
}

/** The long way of a lying sheet: x or z */
export function longAxis(sheet: Part): 0 | 2 {
  const b = boxOf(sheet)
  return b.max[0] - b.min[0] >= b.max[2] - b.min[2] ? 0 : 2
}

/** How far a sheet reaches past the frame on each long side to cover outside legs */
export function coverExtent(f: SheetFrame | undefined): number {
  return f?.legs?.placement === 'outside' && f.legs.cover ? getProfile(f.legs.profileId).thickness : 0
}

/**
 * The sheet as it should be for frame settings `next`, given it was shaped
 * for `prev`: widened (or narrowed back) across the long way when "cover the
 * outside legs" changes, or the leg thickness changes while covering.
 */
export function sheetForFrame(sheet: Part, prev: SheetFrame | undefined, next: SheetFrame | undefined): Part {
  const delta = coverExtent(next) - coverExtent(prev)
  if (!delta) return sheet
  const A = next?.axis ?? prev?.axis ?? longAxis(sheet)
  const B: Axis = A === 0 ? 2 : 0
  const b = boxOf(sheet)
  return resizeAlong(sheet, B, b.min[B] - delta, b.max[B] + delta)
}

/** Lowest top height that leaves room for the frame (and legs at least 50 mm long) */
export function minLegHeight(sheet: Part, f: SheetFrame): number {
  return getProfile(sheet.profileId).thickness + section(f).height + 50
}

/** A standing leg of the given height whose bounding box starts at `min`, its wide face along `wideAxis` */
function legAt(profileId: string, height: number, wideAxis: Axis, min: Vec3): Omit<Part, 'id' | 'name'> {
  const part = { profileId, length: round(height), position: [0, 0, 0] as Vec3, rotation: rotationFor(1, wideAxis) }
  const b = boxOf({ ...part, id: '', name: '' })
  part.position = [0, 1, 2].map((i) => round(min[i] - b.min[i])) as Vec3
  return part
}

/**
 * The frame parts under a lying sheet (without ids/names), and how far the
 * sheet moves up (or down, with legs at a set height) to sit on them.
 *
 * Legs (optional), at the four corners down to the floor, wide face along
 * the long way:
 * - inside: in the inner corners, up to the underside of the sheet
 * - outside: outside the long rails, flush with the ends, up to the sheet
 * - under: under the frame's corners
 * - merged: the legs take the corners up to the sheet and the rails are
 *   shortened to fit between them
 */
export function frameUnder(sheet: Part, f: SheetFrame): { parts: (Omit<Part, 'id' | 'name'> & { role: string })[]; lift: number } {
  const b = boxOf(sheet)
  const { height, plan } = section(f)
  const A: Axis = f.axis ?? longAxis(sheet)
  const B: Axis = A === 0 ? 2 : 0
  const legs = f.legs
  const lift = legs
    ? Math.max(minLegHeight(sheet, f), legs.height) - b.max[1]
    : Math.max(0, height - b.min[1])
  const top = b.min[1] + lift
  const y = top - height
  const a0 = b.min[A]
  const a1 = b.max[A]
  // A sheet widened over outside legs: the frame stays under the original footprint
  const cover = coverExtent(f)
  const b0 = b.min[B] + cover
  const b1 = b.max[B] - cover
  const at = (a: number, bb: number, yy = y): Vec3 => {
    const v = [0, yy, 0] as Vec3
    v[A] = a
    v[B] = bb
    return v
  }
  const out: (Omit<Part, 'id' | 'name'> & { role: string })[] = []
  // Leg footprint: wide side along the long way
  const leg = legs ? getProfile(legs.profileId) : null
  const legA = leg ? leg.width : 0
  const legB = leg ? leg.thickness : 0
  const merged = legs?.placement === 'merged'
  // Long rails along the long sides (between the legs when merged)
  const la0 = merged ? a0 + legA : a0
  const la1 = merged ? a1 - legA : a1
  if (la1 - la0 > 1) {
    out.push({ ...boardAt(f.profileId, la1 - la0, A, f.onEdge, at(la0, b0)), role: 'Långregel' })
    out.push({ ...boardAt(f.profileId, la1 - la0, A, f.onEdge, at(la0, b1 - plan)), role: 'Långregel' })
  }
  // End rails (between the legs when merged) and joists between the long rails
  const inner = b1 - b0 - 2 * plan
  if (inner > 1) {
    const e0 = a0
    const e1 = a1 - plan
    const n = Math.max(0, Math.round(f.joists))
    for (let i = 0; i <= n + 1; i++) {
      const end = i === 0 || i === n + 1
      const a = e0 + ((e1 - e0) * i) / (n + 1)
      if (end && merged) {
        // Between the legs — unless the legs are narrower than the rails, then
        // the long rails reach the end zone and the end rail stays between them
        const off = legA >= plan ? legB : plan
        const len = b1 - b0 - 2 * off
        if (len > 1) out.push({ ...boardAt(f.profileId, len, B, f.onEdge, at(a, b0 + off)), role: 'Kortregel' })
      } else out.push({ ...boardAt(f.profileId, inner, B, f.onEdge, at(a, b0 + plan)), role: end ? 'Kortregel' : 'Tvärregel' })
    }
  }
  // Legs at the four corners
  if (legs && leg) {
    const legTop = legs.placement === 'under' ? y : top
    if (legTop > 1) {
      const corners: [number, number][] =
        legs.placement === 'inside'
          ? [[a0 + plan, b0 + plan], [a1 - plan - legA, b0 + plan], [a0 + plan, b1 - plan - legB], [a1 - plan - legA, b1 - plan - legB]]
          : legs.placement === 'outside'
            ? [[a0, b0 - legB], [a1 - legA, b0 - legB], [a0, b1], [a1 - legA, b1]]
            : [[a0, b0], [a1 - legA, b0], [a0, b1 - legB], [a1 - legA, b1 - legB]]
      for (const [la, lb] of corners) out.push({ ...legAt(legs.profileId, legTop, A, at(la, lb, 0)), role: 'Ben' })
    }
  }
  return { parts: out, lift }
}
