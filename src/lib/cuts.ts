/**
 * Angled end cuts (miter/bevel) and lengthwise rips (French cleat): what they
 * remove from a part, in part-local coordinates (x along the length 0..L,
 * y through the thickness 0..T, z across the width 0..W).
 */
import { Matrix4, Quaternion, Vector3 } from 'three'
import { eulerOf, partBox, partSize, toAxisBox } from './geometry'
import type { EndCut, Part, Rip, Vec3 } from './types'

const EPS = 0.5
const rad = (deg: number) => (deg * Math.PI) / 180

/** Local axis across which an end cut runs: z (width) for a miter, y (thickness) for a bevel. */
const crossAxis = (plane: EndCut['plane']) => (plane === 'face' ? 2 : 1)

/** How far the cut reaches into the part from its end, at position v across the part. */
function cutDepth(cut: EndCut, v: number, span: number): number {
  const t = Math.tan(rad(Math.abs(cut.angle)))
  return cut.angle >= 0 ? v * t : (span - v) * t
}

/** The deepest point of an end cut (how much shorter the short side is). */
export function cutSetback(part: Part, cut: EndCut): number {
  const span = partSize(part)[crossAxis(cut.plane)]
  return span * Math.tan(rad(Math.abs(cut.angle)))
}

/** Rip line: z of the cut's centre at height y. */
function ripCentre(rip: Rip, y: number, size: Vec3): number {
  const [, t, w] = size
  const d = (t / 2) * Math.tan(rad(rip.angle))
  return w / 2 - d + (2 * d * y) / t
}

/**
 * True if this local point has been cut away by an end cut or a rip (notches
 * not included). `onLine` also counts points on the cut line itself — where
 * two cut parts meet — as cut away.
 */
export function isCutAway(part: Part, p: Vec3, onLine = false): boolean {
  const tol = onLine ? EPS : -EPS
  const size = partSize(part)
  const ends = part.ends ?? [null, null]
  for (const [i, cut] of ends.entries()) {
    if (!cut || !cut.angle) continue
    const axis = crossAxis(cut.plane)
    const u = i === 0 ? p[0] : size[0] - p[0]
    if (u < cutDepth(cut, p[axis], size[axis]) + tol) return true
  }
  if (part.rip) {
    const c = ripCentre(part.rip, p[1], size)
    const k = part.rip.kerf / 2
    if (part.rip.half === 0 ? p[2] > c - k - tol : p[2] < c + k + tol) return true
  }
  return false
}

/**
 * Cutter outlines for drawing the part: 2-D polygons in a plane plus how to
 * extrude them through the part. `basis` names the local axes the polygon's
 * (u, v) map to; the third axis is the extrusion.
 */
export interface Cutter {
  basis: 'xz' | 'xy' | 'yz'
  points: [number, number][]
}

export function cutters(part: Part): Cutter[] {
  const size = partSize(part)
  const out: Cutter[] = []
  const m = 5 // margin past the part's faces, for a clean cut
  const ends = part.ends ?? [null, null]
  ends.forEach((cut, i) => {
    if (!cut || !cut.angle) return
    const axis = crossAxis(cut.plane)
    const span = size[axis]
    const line = (v: number) => cutDepth(cut, v, span)
    // Region between the end face and the cut line, padded by the margin
    let pts: [number, number][] = [
      [-m, -m],
      [line(-m), -m],
      [line(span + m), span + m],
      [-m, span + m],
    ]
    if (i === 1) pts = pts.map(([u, v]) => [size[0] - u, v])
    out.push({ basis: cut.plane === 'face' ? 'xz' : 'xy', points: pts })
  })
  if (part.rip) {
    const [, t, w] = size
    const k = part.rip.kerf / 2
    const c = (y: number) => ripCentre(part.rip!, y, size)
    out.push({
      basis: 'yz',
      points:
        part.rip.half === 0
          ? [
              [-m, c(-m) - k],
              [t + m, c(t + m) - k],
              [t + m, w + m],
              [-m, w + m],
            ]
          : [
              [-m, -m],
              [t + m, -m],
              [t + m, c(t + m) + k],
              [-m, c(-m) + k],
            ],
    })
  }
  return out
}

/**
 * Split a part lengthwise at an angle into two pieces (French cleat). Both
 * keep the original size and position; each has the other half cut away.
 */
export function ripPart(part: Part, angle: number, kerf: number, newId: () => string): [Part, Part] {
  const id = newId()
  const base = { ...part, notches: part.notches }
  return [
    { ...base, rip: { id, half: 0, angle, kerf }, name: `${part.name} A` },
    { ...base, id: newId(), rip: { id, half: 1, angle, kerf }, name: `${part.name} B` },
  ]
}

// ---------------------------------------------------------------- miter corner

function partRotation(part: Part): Matrix4 {
  return new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromEuler(eulerOf(part.rotation)))
}

/** Which local axis of `part` a world direction lies along (and the sign). */
function localAxisOf(part: Part, world: Vector3): { axis: number; sign: number } {
  const v = world.clone().applyMatrix4(partRotation(part).invert())
  const c = [v.x, v.y, v.z]
  const axis = c.map(Math.abs).indexOf(Math.max(...c.map(Math.abs)))
  return { axis, sign: Math.sign(c[axis]) }
}

/** Which end of the part (0 = start, 1 = end) a local box sits at, or null. */
function endAt(part: Part, local: { min: Vec3; max: Vec3 }): 0 | 1 | null {
  const L = partSize(part)[0]
  if (local.min[0] <= EPS && local.max[0] < L - EPS) return 0
  if (local.max[0] >= L - EPS && local.min[0] > EPS) return 1
  return null
}

/**
 * Miter an L-corner: both parts run to the outer corner and overlap in a
 * square there. Each gets an end cut along the diagonal from the outer to the
 * inner corner. Returns null if they don't meet end to end in a plane.
 */
export function miterCorner(
  a: Part,
  b: Part,
  overlap: { min: Vec3; max: Vec3 },
  toLocal: (p: Part, box: { min: Vec3; max: Vec3 }) => { min: Vec3; max: Vec3 },
): [Part, Part] | null {
  const lengthDir = (p: Part) => new Vector3(1, 0, 0).applyMatrix4(partRotation(p))
  const one = (p: Part, other: Part): Part | null => {
    const local = toLocal(p, overlap)
    const end = endAt(p, local)
    if (end === null) return null
    // The other part runs across this one along this local axis
    const { axis } = localAxisOf(p, lengthDir(other))
    if (axis === 0) return null
    const size = partSize(p)
    const plane: EndCut['plane'] = axis === 2 ? 'face' : 'edge'
    // The miter angle that makes the cut run corner to corner
    const along = local.max[0] - local.min[0]
    const across = size[axis]
    const angle = (Math.atan2(along, across) * 180) / Math.PI
    // The long point is on the outer side, away from the other part's body
    const otherCentre = toLocal(p, toAxisBox(partBox(other)))
    const centre = (otherCentre.min[axis] + otherCentre.max[axis]) / 2
    const sign = centre > across / 2 ? 1 : -1
    const ends: [EndCut | null, EndCut | null] = [...(p.ends ?? [null, null])] as [EndCut | null, EndCut | null]
    ends[end] = { plane, angle: Math.round(angle * 10) / 10 * sign }
    return { ...p, ends }
  }
  const na = one(a, b)
  const nb = one(b, a)
  return na && nb ? [na, nb] : null
}

// ---------------------------------------------------------------- descriptions

const fmtDeg = (a: number) => `${String(Math.round(Math.abs(a) * 10) / 10).replace('.', ',')}°`

/** "Gering 45° i början" etc., for the cut list. */
export function describeCuts(part: Part): string[] {
  const notes: string[] = []
  const ends = part.ends ?? [null, null]
  const where = ['början', 'slutet']
  ends.forEach((cut, i) => {
    if (!cut || !cut.angle) return
    // 'edge' is still a miter, sawn with the board standing on edge (högkant)
    const how = cut.plane === 'face' ? 'Gering' : 'Gering på högkant'
    notes.push(`${how} ${fmtDeg(cut.angle)} i ${where[i]} (längden mätt på långsidan)`)
  })
  return notes
}
