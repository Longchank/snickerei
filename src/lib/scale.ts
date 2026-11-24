/**
 * Skala (Detaljer, owner 2026-11-24): tap the face of a part that should
 * grow, then where it should end — the face moves there and the opposite
 * face stays. Only sizes that can change: a board's length, a sheet's
 * length and width (cross-sections and sheet thickness are fixed).
 */
import { partBox, round, toAxisBox, type AxisBox } from './geometry'
import { freeSizeAlong, resizeAlong } from './resize'
import type { Part, Vec3 } from './types'

type Axis = 0 | 1 | 2

/** A face of the part's box: the axis and which end (0 = the low side, 1 = the high side) */
export interface ScaleFace {
  axis: Axis
  side: 0 | 1
}

const boxOf = (p: Part): AxisBox => toAxisBox(partBox(p))

/** The faces that can be moved (the part can change size along their axis) */
export function scaleFaces(part: Part): ScaleFace[] {
  return ([0, 1, 2] as Axis[]).filter((a) => freeSizeAlong(part, a)).flatMap((axis) => [
    { axis, side: 0 as const },
    { axis, side: 1 as const },
  ])
}

/** The face a tap with this outward normal is on, if it can be moved */
export function faceFromNormal(part: Part, normal: Vec3): ScaleFace | null {
  const axis = ([0, 1, 2] as Axis[]).reduce((m, i) => (Math.abs(normal[i]) > Math.abs(normal[m]) ? i : m), 0 as Axis)
  if (Math.abs(normal[axis]) < 0.5 || !freeSizeAlong(part, axis)) return null
  return { axis, side: normal[axis] > 0 ? 1 : 0 }
}

/** Move the face to `coord` along its axis; the other face stays (never smaller than 10 mm) */
export function scaleTo(part: Part, face: ScaleFace, coord: number): Part {
  const b = boxOf(part)
  const c = round(coord)
  return face.side === 1
    ? resizeAlong(part, face.axis, b.min[face.axis], Math.max(b.min[face.axis] + 10, c))
    : resizeAlong(part, face.axis, Math.min(b.max[face.axis] - 10, c), b.max[face.axis])
}

/** Grow (positive) or shrink (negative) the face by `delta` mm */
export function scaleBy(part: Part, face: ScaleFace, delta: number): Part {
  const b = boxOf(part)
  return scaleTo(part, face, face.side === 1 ? b.max[face.axis] + delta : b.min[face.axis] - delta)
}

/**
 * Where a tap says the face should end, along its axis: on a face parallel
 * to it, that face's plane; on another part's side, the nearer of that
 * part's two faces across the axis (so the board reaches it or stops at
 * it); on the floor, the floor itself for a downward face, else the tap.
 */
export function scaleTarget(part: Part, face: ScaleFace, hit: Vec3, normal: Vec3 | null, target: Part | null): number {
  const a = face.axis
  if (!target) return a === 1 ? 0 : hit[a]
  if (normal && Math.abs(normal[a]) > 0.5) return hit[a]
  const tb = boxOf(target)
  const b = boxOf(part)
  // The target's face on the side the part is growing towards reaches; the far face when it's around the part
  const end = face.side === 1 ? b.max[a] : b.min[a]
  const near = face.side === 1 ? (end <= tb.min[a] + 0.5 ? tb.min[a] : tb.max[a]) : end >= tb.max[a] - 0.5 ? tb.max[a] : tb.min[a]
  return near
}

/** Length of the part along the face's axis */
export const sizeAlong = (part: Part, axis: Axis) => {
  const b = boxOf(part)
  return round(b.max[axis] - b.min[axis])
}

/** The movable face nearest a tap anywhere on the part (an end face is hard to hit on a phone) */
export function nearestFace(part: Part, hit: Vec3): ScaleFace | null {
  const b = boxOf(part)
  let best: ScaleFace | null = null
  let dist = Infinity
  for (const f of scaleFaces(part)) {
    const d = Math.abs(hit[f.axis] - (f.side ? b.max[f.axis] : b.min[f.axis]))
    if (d < dist) {
      dist = d
      best = f
    }
  }
  return best
}
