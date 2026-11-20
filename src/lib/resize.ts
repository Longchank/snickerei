/**
 * Changing sizes from the dimension labels in the 3D view: a board's length,
 * a sheet's length or width, and stretching a group (or the whole build)
 * along one axis while every board keeps its cross-section (a 45×70 stays a
 * 45×70).
 */
import { getProfile } from './catalog'
import { partBox, round, toAxisBox, type AxisBox } from './geometry'
import { unionBox } from './joints'
import { worldAxisOf } from './place'
import type { Part } from './types'

type Axis = 0 | 1 | 2
const TOL = 1
const boxOf = (p: Part) => toAxisBox(partBox(p))

/** Which local size of the part runs along this world axis, if it can change: 'length' or 'width' (sheets) */
export function freeSizeAlong(part: Part, axis: Axis): 'length' | 'width' | null {
  if (worldAxisOf(part.rotation, 0) === axis) return 'length'
  if (getProfile(part.profileId).kind === 'sheet' && worldAxisOf(part.rotation, 2) === axis) return 'width'
  return null
}

/**
 * Give a part a new extent [min, max] along a world axis it can change size
 * in, keeping its place on the other two axes.
 */
export function resizeAlong(part: Part, axis: Axis, min: number, max: number): Part {
  const field = freeSizeAlong(part, axis)
  if (!field) return part
  const size = Math.max(1, round(max - min))
  const resized: Part = { ...part, [field]: size }
  const before = boxOf(part)
  const after = boxOf(resized)
  const position = [...resized.position] as Part['position']
  for (const i of [0, 1, 2] as const) {
    const target = i === axis ? min : before.min[i]
    position[i] = round(position[i] + target - after.min[i])
  }
  return { ...resized, position }
}

/** A part's new size along an axis, keeping its lower end where it is */
export function setSizeAlong(part: Part, axis: Axis, size: number): Part {
  const b = boxOf(part)
  return resizeAlong(part, axis, b.min[axis], b.min[axis] + size)
}

const overlapsAcross = (a: AxisBox, b: AxisBox, axis: Axis) =>
  ([0, 1, 2] as Axis[]).filter((i) => i !== axis).every((i) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]) > -TOL)

/**
 * Stretch (or shrink) parts along one axis so their outer size becomes
 * `size`. Parts that can't change size that way (a board across the axis,
 * a sheet's thickness) only move: at the near end they stay, at the far end
 * they move the whole difference, in between they keep their relative place.
 * Parts that can (boards along the axis, sheets) change length; each of their
 * ends follows a moving part it butts against, or else the same rule.
 */
export function stretchParts(parts: Part[], axis: Axis, size: number): Part[] {
  const box = unionBox(parts)
  if (!box) return parts
  const m = box.min[axis]
  const M = box.max[axis]
  const L = M - m
  if (L <= 0 || size < 1) return parts
  const delta = size - L
  const scale = (x: number) => m + ((x - m) * size) / L
  const shiftFor = (x: number) => (Math.abs(x - m) < TOL ? 0 : Math.abs(x - M) < TOL ? delta : scale(x) - x)

  const boxes = new Map(parts.map((p) => [p.id, boxOf(p)]))
  const fixed = parts.filter((p) => !freeSizeAlong(p, axis))
  const shifts = new Map<string, number>()
  // 1. Parts at the near or far end are anchored there
  for (const p of fixed) {
    const b = boxes.get(p.id)!
    if (Math.abs(b.min[axis] - m) < TOL) shifts.set(p.id, 0)
    else if (Math.abs(b.max[axis] - M) < TOL) shifts.set(p.id, delta)
  }
  // 2. A part butting against an anchored one follows it (a leg tucked inside a
  //    corner, behind an end rail), spreading outward from both ends at once
  let frontier = fixed.filter((p) => shifts.has(p.id))
  while (frontier.length) {
    const next: Part[] = []
    for (const p of fixed) {
      if (shifts.has(p.id)) continue
      const b = boxes.get(p.id)!
      const by = frontier.find((q) => {
        const c = boxes.get(q.id)!
        const butts = Math.abs(c.max[axis] - b.min[axis]) < TOL || Math.abs(b.max[axis] - c.min[axis]) < TOL
        return butts && overlapsAcross(b, c, axis)
      })
      if (by) next.push(p)
      if (by) shifts.set(p.id, shifts.get(by.id)!)
    }
    frontier = next
  }
  // 3. The rest keep their relative place
  for (const p of fixed) {
    if (shifts.has(p.id)) continue
    const b = boxes.get(p.id)!
    const c = (b.min[axis] + b.max[axis]) / 2
    shifts.set(p.id, scale(c) - c)
  }
  /** How far an end at x of the stretchable part with box b moves */
  const endShift = (b: AxisBox, x: number) => {
    for (const q of fixed) {
      const c = boxes.get(q.id)!
      const touches = x >= c.min[axis] - TOL && x <= c.max[axis] + TOL
      if (touches && overlapsAcross(b, c, axis)) return shifts.get(q.id)!
    }
    return shiftFor(x)
  }
  return parts.map((p) => {
    const b = boxes.get(p.id)!
    if (shifts.has(p.id)) {
      const s = round(shifts.get(p.id)!)
      if (!s) return p
      const position = [...p.position] as Part['position']
      position[axis] = round(position[axis] + s)
      return { ...p, position }
    }
    const lo = b.min[axis] + endShift(b, b.min[axis])
    const hi = b.max[axis] + endShift(b, b.max[axis])
    return resizeAlong(p, axis, lo, Math.max(lo + 1, hi))
  })
}
