/**
 * Naming a board's two ends by where they point in the model ("Övre änden",
 * "Vänstra änden" …) instead of start/end, and where they are — so the Ändar
 * menu and labels in the 3D view agree.
 */
import { Euler, Vector3 } from 'three'
import { eulerOf, partBox, toAxisBox } from './geometry'
import type { Part, Vec3 } from './types'

/** Words per world axis, [minus side, plus side]; y is up, z towards the viewer */
const NAMES: [string, string][] = [
  ['Vänstra', 'Högra'],
  ['Nedre', 'Övre'],
  ['Bakre', 'Främre'],
]

/** World axis and sign of the part's length direction (local +x) */
function lengthDir(part: Part): { axis: 0 | 1 | 2; sign: 1 | -1 } {
  const v = new Vector3(1, 0, 0).applyEuler(new Euler().copy(eulerOf(part.rotation)))
  const c = [v.x, v.y, v.z]
  const axis = c.map(Math.abs).indexOf(Math.max(...c.map(Math.abs))) as 0 | 1 | 2
  return { axis, sign: c[axis] > 0 ? 1 : -1 }
}

/** Which way an end points: end 0 (local x = 0) points against the length direction */
function endSide(part: Part, end: 0 | 1): { axis: 0 | 1 | 2; plus: boolean } {
  const { axis, sign } = lengthDir(part)
  return { axis, plus: (end === 1) === sign > 0 }
}

/** "Övre", "Vänstra" … for one end of the part */
export function endName(part: Part, end: 0 | 1): string {
  const { axis, plus } = endSide(part, end)
  return NAMES[axis][plus ? 1 : 0]
}

/** Centre of an end face, in world coordinates */
export function endPoint(part: Part, end: 0 | 1): Vec3 {
  const b = toAxisBox(partBox(part))
  const { axis, plus } = endSide(part, end)
  const p = [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2) as Vec3
  p[axis] = plus ? b.max[axis] : b.min[axis]
  return p
}
