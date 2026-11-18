/**
 * Moving a selection by tapping where it should go: flush against a face of
 * another board (at its start, centre or end), or onto the floor.
 */
import { Euler, Vector3 } from 'three'
import { eulerOf, partBox, toAxisBox, type AxisBox } from './geometry'
import type { FreeSpace } from './measure'
import type { Anchor } from './place'
import type { Part, Vec3 } from './types'

type Axis = 0 | 1 | 2
const AXES: Axis[] = [0, 1, 2]

function lengthAxis(p: Part): Axis {
  const v = new Vector3(1, 0, 0).applyEuler(new Euler().copy(eulerOf(p.rotation)))
  const c = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)]
  return c.indexOf(Math.max(...c)) as Axis
}

/** Of aligning min-to-min or max-to-max, the shift that moves the least */
function flushShift(sel: AxisBox, target: AxisBox, a: Axis): number {
  const toMin = target.min[a] - sel.min[a]
  const toMax = target.max[a] - sel.max[a]
  return Math.abs(toMin) <= Math.abs(toMax) ? toMin : toMax
}

/**
 * The shift that puts the selection against the tapped face of `target`:
 * just outside it along the face's normal; along the target's length at
 * its start, centre or end (by where the tap was); and flush with the target
 * in the remaining direction, on whichever side is nearer.
 */
export function moveNextTo(sel: AxisBox, target: Part, hit: Vec3, normal: Vec3): { delta: Vec3; anchor: Anchor } {
  const t = toAxisBox(partBox(target))
  const n = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))) as Axis
  const sign = normal[n] >= 0 ? 1 : -1
  const delta: Vec3 = [0, 0, 0]
  // Against the face, on the outside
  delta[n] = sign > 0 ? t.max[n] - sel.min[n] : t.min[n] - sel.max[n]

  let anchor: Anchor = 'free'
  const la = lengthAxis(target)
  for (const a of AXES) {
    if (a === n) continue
    if (a === la) {
      const len = t.max[a] - t.min[a] || 1
      const f = (hit[a] - t.min[a]) / len
      anchor = f <= 0.25 ? 'start' : f >= 0.75 ? 'end' : f >= 0.375 && f <= 0.625 ? 'mid' : 'free'
      const selMid = (sel.min[a] + sel.max[a]) / 2
      delta[a] =
        anchor === 'start'
          ? t.min[a] - sel.min[a]
          : anchor === 'end'
            ? t.max[a] - sel.max[a]
            : anchor === 'mid'
              ? (t.min[a] + t.max[a]) / 2 - selMid
              : Math.round(hit[a] / 5) * 5 - selMid
    } else {
      delta[a] = flushShift(sel, t, a)
    }
  }
  return { delta: delta.map((v) => Math.round(v * 10) / 10) as Vec3, anchor }
}

/** The shift that sets the selection on the floor, centred on the tapped spot. */
export function moveToFloor(sel: AxisBox, hit: Vec3): Vec3 {
  const cx = (sel.min[0] + sel.max[0]) / 2
  const cz = (sel.min[2] + sel.max[2]) / 2
  return [Math.round((hit[0] - cx) / 5) * 5, -sel.min[1], Math.round((hit[2] - cz) / 5) * 5]
}

/**
 * The move that makes a free-space gap (the green number in the view) exactly
 * `gap` mm: the selection slides along the gap's direction, towards or away
 * from what it measures to. Never closer than touching.
 */
export function moveToGap(space: FreeSpace, gap: number): Vec3 {
  const sign = Math.sign(space.end[space.axis] - space.from[space.axis]) || 1
  const d: Vec3 = [0, 0, 0]
  d[space.axis] = Math.round(sign * (space.gap - Math.max(0, gap)) * 10) / 10
  return d
}
