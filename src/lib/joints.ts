import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { eulerOf, partBox, partSize, round, rotatePart, toAxisBox, type AxisBox } from './geometry'
import { getProfile } from './catalog'
import { isCutAway } from './cuts'
import type { Notch, Part, Vec3 } from './types'

const EPS = 0.5

function partMatrix(part: Part): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...part.position),
    new Quaternion().setFromEuler(eulerOf(part.rotation)),
    new Vector3(1, 1, 1),
  )
}

function transformBox(box: AxisBox, m: Matrix4): AxisBox {
  const a = new Vector3(...box.min).applyMatrix4(m)
  const b = new Vector3(...box.max).applyMatrix4(m)
  return {
    min: [round(Math.min(a.x, b.x)), round(Math.min(a.y, b.y)), round(Math.min(a.z, b.z))],
    max: [round(Math.max(a.x, b.x)), round(Math.max(a.y, b.y)), round(Math.max(a.z, b.z))],
  }
}

/** A world-space box in the part's local coordinates (exact: rotations are quarter turns). */
export function toLocalBox(part: Part, world: AxisBox): AxisBox {
  return transformBox(world, partMatrix(part).invert())
}

export function toWorldBox(part: Part, local: AxisBox): AxisBox {
  return transformBox(local, partMatrix(part))
}

/** Overlap of two boxes, or null if they only touch or are apart. */
export function intersect(a: AxisBox, b: AxisBox): AxisBox | null {
  const min = [0, 1, 2].map((i) => Math.max(a.min[i], b.min[i])) as Vec3
  const max = [0, 1, 2].map((i) => Math.min(a.max[i], b.max[i])) as Vec3
  return [0, 1, 2].every((i) => max[i] - min[i] > EPS) ? { min, max } : null
}

/** Clip a local box to the part's own extent. */
function clipToPart(part: Part, box: AxisBox): AxisBox | null {
  const size = partSize(part)
  return intersect(box, { min: [0, 0, 0], max: size })
}

export interface Overlap {
  other: Part
  /** World-space overlap */
  box: AxisBox
}

/**
 * Other parts that overlap this one in volume. Material already notched out of
 * the two parts doesn't count, so a finished joint stops showing up.
 */
export function overlapsOf(part: Part, parts: Part[]): Overlap[] {
  const mine = toAxisBox(partBox(part))
  const result: Overlap[] = []
  for (const other of parts) {
    if (other.id === part.id) continue
    // The two halves of a ripped board fit together by design
    if (part.rip && other.rip?.id === part.rip.id) continue
    const box = intersect(mine, toAxisBox(partBox(other)))
    if (box && !isResolved(box, [part, other])) result.push({ other, box })
  }
  return result
}

/** True if every sample point of the world box is cut away from one of the parts. */
function isResolved(world: AxisBox, parts: Part[]): boolean {
  const notched = parts.filter((p) => p.notches?.length || p.ends?.some((e) => e?.angle) || p.rip)
  if (!notched.length) return false
  const inverse = notched.map((p) => ({ p, m: partMatrix(p).invert() }))
  const f = [0.02, 0.25, 0.5, 0.75, 0.98]
  for (const fx of f)
    for (const fy of f)
      for (const fz of f) {
        const pt = new Vector3(
          world.min[0] + (world.max[0] - world.min[0]) * fx,
          world.min[1] + (world.max[1] - world.min[1]) * fy,
          world.min[2] + (world.max[2] - world.min[2]) * fz,
        )
        const inside = inverse.some(({ p, m }) => {
          const l = pt.clone().applyMatrix4(m)
          const v = [l.x, l.y, l.z]
          return (
            isCutAway(p, v as Vec3, true) ||
            (p.notches ?? []).some((n) => [0, 1, 2].every((i) => v[i] >= n.min[i] - EPS && v[i] <= n.max[i] + EPS))
          )
        })
        if (!inside) return false
      }
  return true
}

/** Unit vector of a local axis in world space. */
function worldDir(part: Part, axis: 0 | 1 | 2): Vector3 {
  const v = new Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0)
  return v.applyEuler(new Euler().copy(eulerOf(part.rotation)))
}

function shiftNotches(notches: Notch[] | undefined, axis: number, by: number, size: Vec3): Notch[] | undefined {
  if (!notches) return undefined
  const out: Notch[] = []
  for (const n of notches) {
    const min = [...n.min] as Vec3
    const max = [...n.max] as Vec3
    min[axis] -= by
    max[axis] -= by
    const clipped = intersect({ min, max }, { min: [0, 0, 0], max: size })
    if (clipped) out.push({ ...n, ...clipped })
  }
  return out.length ? out : undefined
}

/**
 * Butt joint: shorten the part so it ends where the other part begins. Works
 * along the length (and, for sheets, the width) when the overlap is at an end.
 * Returns null when the other part crosses the middle.
 */
export function trimAgainst(part: Part, overlap: AxisBox): Part | null {
  const local = toLocalBox(part, overlap)
  const size = partSize(part)
  const axes: (0 | 2)[] = getProfile(part.profileId).kind === 'sheet' ? [0, 2] : [0]
  let best: { part: Part; removed: number } | null = null

  for (const axis of axes) {
    const len = size[axis]
    const [a, b] = [local.min[axis], local.max[axis]]
    let candidate: Part | null = null
    let removed = 0
    if (a <= EPS && b < len - EPS) {
      // Overlap at the start: cut it off and move the part's origin forward
      const d = worldDir(part, axis).multiplyScalar(b)
      const newSize = [...size] as Vec3
      newSize[axis] = round(len - b)
      candidate = {
        ...part,
        position: [round(part.position[0] + d.x), round(part.position[1] + d.y), round(part.position[2] + d.z)],
        ...(axis === 0 ? { length: newSize[0] } : { width: newSize[2] }),
        notches: shiftNotches(part.notches, axis, b, newSize),
      }
      removed = b
    } else if (b >= len - EPS && a > EPS) {
      const newSize = [...size] as Vec3
      newSize[axis] = round(a)
      candidate = {
        ...part,
        ...(axis === 0 ? { length: newSize[0] } : { width: newSize[2] }),
        notches: shiftNotches(part.notches, axis, 0, newSize),
      }
      removed = len - a
    }
    if (candidate && (!best || removed < best.removed)) best = { part: candidate, removed }
  }
  return best?.part ?? null
}

/** Cut the overlap (or part of it) out of the part. */
export function notchAgainst(part: Part, world: AxisBox, kind: Notch['kind'], withName?: string): Part {
  const local = clipToPart(part, toLocalBox(part, world))
  if (!local) return part
  return { ...part, notches: [...(part.notches ?? []), { ...local, kind, withName }] }
}

/**
 * Half lap ("halvt i halvt"): split the overlap across its thinnest direction;
 * the part sitting higher on that axis loses the lower half, the other the upper.
 */
export function halfLap(a: Part, b: Part, overlap: AxisBox): [Part, Part] {
  const ext = [0, 1, 2].map((i) => overlap.max[i] - overlap.min[i])
  const axis = ext.indexOf(Math.min(...ext))
  const mid = round((overlap.min[axis] + overlap.max[axis]) / 2)
  const centre = (p: Part) => {
    const box = toAxisBox(partBox(p))
    return (box.min[axis] + box.max[axis]) / 2
  }
  const [upper, lower] = centre(a) >= centre(b) ? [a, b] : [b, a]
  const lowerHalf: AxisBox = { min: [...overlap.min], max: [...overlap.max] }
  lowerHalf.max[axis] = mid
  const upperHalf: AxisBox = { min: [...overlap.min], max: [...overlap.max] }
  upperHalf.min[axis] = mid
  const u = notchAgainst(upper, lowerHalf, 'halvt', lower.name)
  const l = notchAgainst(lower, upperHalf, 'halvt', upper.name)
  return upper === a ? [u, l] : [l, u]
}

const AXIS_NAME = ['längs', 'tjocklek', 'bredd'] as const

/** "Urtag 45 × 22,5 mm, 300–345 mm från änden (mot Ben #2)" */
export function describeNotch(part: Part, n: Notch): string {
  const size = partSize(part)
  const fmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')
  const along = `${fmt(n.min[0])}–${fmt(n.max[0])} mm från änden`
  // Depth: the directions where the notch doesn't go all the way through
  const depths = [1, 2]
    .filter((i) => n.max[i] - n.min[i] < size[i] - EPS)
    .map((i) => `${fmt(n.max[i] - n.min[i])} mm djupt (${AXIS_NAME[i]})`)
  const kind = n.kind === 'halvt' ? 'Halvt i halvt' : 'Urtag'
  return `${kind} ${fmt(n.max[0] - n.min[0])} mm brett, ${depths.join(', ') || 'genomgående'}, ${along}${
    n.withName ? ` (mot ${n.withName})` : ''
  }`
}

// ---------------------------------------------------------------- selections

/** Bounding box of several parts. */
export function unionBox(parts: Part[]): AxisBox | null {
  if (!parts.length) return null
  const boxes = parts.map((p) => toAxisBox(partBox(p)))
  return {
    min: [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]))) as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]))) as Vec3,
  }
}

export function moveParts(parts: Part[], d: Vec3): Part[] {
  return parts.map((p) => ({
    ...p,
    position: [round(p.position[0] + d[0]), round(p.position[1] + d[1]), round(p.position[2] + d[2])],
  }))
}

/**
 * Rotate several parts a quarter turn around a world axis as one rigid body,
 * keeping the selection's bounding-box min corner in place.
 */
export function rotateParts(parts: Part[], axis: 0 | 1 | 2): Part[] {
  const before = unionBox(parts)
  if (!before) return parts
  const pivot = new Vector3(...before.min)
  const turn = new Matrix4().makeRotationFromQuaternion(
    new Quaternion().setFromAxisAngle(new Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0), Math.PI / 2),
  )
  const m = new Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(turn).multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z))
  const rotated = parts.map((p) => {
    const target = transformBox(toAxisBox(partBox(p)), m)
    const r = rotatePart(p, axis)
    const now = toAxisBox(partBox(r))
    return moveParts([r], [0, 1, 2].map((i) => target.min[i] - now.min[i]) as Vec3)[0]
  })
  const after = unionBox(rotated)!
  return moveParts(rotated, [0, 1, 2].map((i) => before.min[i] - after.min[i]) as Vec3)
}

/**
 * Turn several parts 90° (dir 1) or −90° (dir −1) around a world axis as one
 * body, about the centre of their bounding box, so they turn in place.
 */
export function rotatePartsInPlace(parts: Part[], axis: 0 | 1 | 2, dir: 1 | -1): Part[] {
  const before = unionBox(parts)
  if (!before) return parts
  let turned = parts
  for (let i = 0; i < (dir > 0 ? 1 : 3); i++) turned = rotateParts(turned, axis)
  const after = unionBox(turned)!
  const centre = (b: AxisBox, i: number) => (b.min[i] + b.max[i]) / 2
  const shift = [0, 1, 2].map((i) => centre(before, i) - centre(after, i)) as Vec3
  // Floor rule: a selection resting on the floor stays on it (so tipping a board up
  // stands it on the floor), and one above the floor is never turned through it.
  const onFloor = Math.abs(before.min[1]) < 0.5
  if (onFloor || (before.min[1] >= 0 && after.min[1] + shift[1] < 0)) shift[1] = -after.min[1]
  return moveParts(turned, shift)
}

/**
 * Every collision involving the selected parts — with parts outside the
 * selection and between selected parts (a group colliding with itself) —
 * each pair once.
 */
export function selectionOverlaps(selected: Part[], parts: Part[]): Overlap[] {
  const out: Overlap[] = []
  const seen = new Set<string>()
  for (const p of selected)
    for (const o of overlapsOf(p, parts)) {
      const key = [p.id, o.other.id].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      out.push(o)
    }
  return out
}
