import { toAxisBox, partBox, type AxisBox } from './geometry'
import type { MeasureKind } from './ergonomics'
import type { MeasurePoint, Measurement, Part, Vec3 } from './types'

const EPS = 0.5
const AXIS_NAMES = ['x', 'y', 'z'] as const

export type Direction = 'under' | 'över' | 'vänster' | 'höger' | 'bakom' | 'framför'

/** [axis, sign] for each direction; y is up, z towards the viewer */
const DIRECTIONS: [Direction, 0 | 1 | 2, -1 | 1][] = [
  ['under', 1, -1],
  ['över', 1, 1],
  ['vänster', 0, -1],
  ['höger', 0, 1],
  ['bakom', 2, -1],
  ['framför', 2, 1],
]

export interface FreeSpace {
  direction: Direction
  axis: 0 | 1 | 2
  /** Free distance in mm */
  gap: number
  /** What the space ends at: a part's name, or 'golvet' */
  to: string
  /** The gap as a line: from the selection's face to the obstacle */
  from: Vec3
  end: Vec3
}

/**
 * Empty space around a box in each of six directions, measured from the
 * middle half of each face — so a tabletop's legs at the corners don't hide
 * the free space under its middle — up to the nearest part in the way (or the
 * floor below). Uses bounding boxes, so notches and angled cuts are ignored.
 */
export function freeSpace(box: AxisBox, others: { name: string; box: AxisBox }[]): FreeSpace[] {
  const out: FreeSpace[] = []
  const centre = [0, 1, 2].map((i) => (box.min[i] + box.max[i]) / 2)
  for (const [direction, axis, sign] of DIRECTIONS) {
    const rest = [0, 1, 2].filter((i) => i !== axis)
    const face = sign < 0 ? box.min[axis] : box.max[axis]
    // The middle half of the face
    const probe = rest.map((i) => {
      const q = (box.max[i] - box.min[i]) / 4
      return [box.min[i] + q, box.max[i] - q] as [number, number]
    })
    let best: { gap: number; to: string; over: [number, number][] } | null = null
    for (const o of others) {
      // Must be in front of the face and overlap its middle in the other two directions
      const overlap = rest.map((i, k) => [Math.max(probe[k][0], o.box.min[i]), Math.min(probe[k][1], o.box.max[i])] as [number, number])
      if (overlap.some(([lo, hi]) => hi - lo <= EPS)) continue
      const gap = sign < 0 ? face - o.box.max[axis] : o.box.min[axis] - face
      if (gap < -EPS) continue
      if (!best || gap < best.gap) best = { gap: Math.max(0, gap), to: o.name, over: overlap }
    }
    if (axis === 1 && sign < 0 && face >= 0 && (!best || face < best.gap)) best = { gap: face, to: 'golvet', over: [] }
    if (!best || best.gap <= EPS) continue
    // Draw the line through the middle of the shared area
    const from = [...centre] as Vec3
    if (best.over.length) best.over.forEach(([lo, hi], k) => (from[rest[k]] = (lo + hi) / 2))
    from[axis] = face
    const end = [...from] as Vec3
    end[axis] = face + sign * best.gap
    out.push({ direction, axis, gap: Math.round(best.gap * 10) / 10, to: best.to, from, end })
  }
  return out
}

export function otherBoxes(parts: Part[], exclude: Set<string>) {
  return parts.filter((p) => !exclude.has(p.id)).map((p) => ({ name: p.name, box: toAxisBox(partBox(p)) }))
}

/**
 * What a pair of picked points measures: the distance straight out from the
 * first surface (along its normal) to the level of the second point — a gap,
 * a height, a length — rather than the slanted distance between the taps.
 * Two taps on the same plane (both on a seat, both on the floor) measure
 * along it instead, in the direction they differ most.
 */
export function measureValue(m: Pick<Measurement, 'a' | 'b'>): { axis: 0 | 1 | 2; value: number; kind: MeasureKind; ends: [Vec3, Vec3] } {
  // A tap on the floor measures upwards from the floor, whichever came first
  const [a, b] = m.b.floor && !m.a.floor ? [m.b, m.a] : [m.a, m.b]
  const delta = [0, 1, 2].map((i) => Math.abs(b.point[i] - a.point[i]))
  let axis = a.axis
  if (delta[axis] < 1) axis = delta.indexOf(Math.max(...delta)) as 0 | 1 | 2
  const end = [...a.point] as Vec3
  end[axis] = b.point[axis]
  const kind: MeasureKind = axis !== 1 ? 'horizontal' : a.floor || b.floor ? 'height' : 'vgap'
  return { axis, value: Math.round(delta[axis] * 10) / 10, kind, ends: [a.point, end] }
}

export const axisName = (axis: number) => AXIS_NAMES[axis]

/** Snap a picked point onto the picked surface plane and to whole mm. */
export function pickPoint(point: Vec3, normal: Vec3, floor: boolean): MeasurePoint {
  const abs = normal.map(Math.abs)
  const axis = abs.indexOf(Math.max(...abs)) as 0 | 1 | 2
  return { point: point.map((v) => Math.round(v)) as Vec3, axis, floor }
}
