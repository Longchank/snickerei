/**
 * "Ram under skivan": build the framing under a lying sheet — two long
 * rails along its long sides, two end rails between them, and joists
 * (tvärreglar) evenly spaced across, all flush with the sheet's edges.
 */
import { getProfile } from './catalog'
import { partBox, round, toAxisBox } from './geometry'
import { rotationFor } from './place'
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

/**
 * The frame parts under a lying sheet (without ids/names), and how far the
 * sheet must move up so the frame doesn't go through the floor.
 */
export function frameUnder(sheet: Part, f: SheetFrame): { parts: (Omit<Part, 'id' | 'name'> & { role: string })[]; lift: number } {
  const b = boxOf(sheet)
  const { height, plan } = section(f)
  const sx = b.max[0] - b.min[0]
  const sz = b.max[2] - b.min[2]
  const A: Axis = sx >= sz ? 0 : 2 // long way
  const B: Axis = A === 0 ? 2 : 0
  const lift = Math.max(0, height - b.min[1])
  const top = b.min[1] + lift
  const y = top - height
  const a0 = b.min[A]
  const a1 = b.max[A]
  const b0 = b.min[B]
  const b1 = b.max[B]
  const at = (a: number, bb: number): Vec3 => {
    const v = [0, y, 0] as Vec3
    v[A] = a
    v[B] = bb
    return v
  }
  const out: (Omit<Part, 'id' | 'name'> & { role: string })[] = []
  // Long rails along the long sides
  out.push({ ...boardAt(f.profileId, a1 - a0, A, f.onEdge, at(a0, b0)), role: 'Långregel' })
  out.push({ ...boardAt(f.profileId, a1 - a0, A, f.onEdge, at(a0, b1 - plan)), role: 'Långregel' })
  // End rails and joists between the long rails
  const inner = b1 - b0 - 2 * plan
  if (inner > 1) {
    const e0 = a0
    const e1 = a1 - plan
    const n = Math.max(0, Math.round(f.joists))
    for (let i = 0; i <= n + 1; i++) {
      const a = e0 + ((e1 - e0) * i) / (n + 1)
      out.push({
        ...boardAt(f.profileId, inner, B, f.onEdge, at(a, b0 + plan)),
        role: i === 0 || i === n + 1 ? 'Kortregel' : 'Tvärregel',
      })
    }
  }
  return { parts: out, lift }
}
