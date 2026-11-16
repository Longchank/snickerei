import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { getProfile } from './catalog'
import type { Part, QuarterTurns, Vec3 } from './types'

export function partSize(part: Part): Vec3 {
  const prof = getProfile(part.profileId)
  return [part.length, prof.thickness, prof.width]
}

export function eulerOf(rot: QuarterTurns): Euler {
  return new Euler(rot[0] * (Math.PI / 2), rot[1] * (Math.PI / 2), rot[2] * (Math.PI / 2), 'XYZ')
}

/** World-space axis-aligned bounding box of a part. */
export function partBox(part: Part): Box3 {
  const [l, t, w] = partSize(part)
  const m = new Matrix4().compose(
    new Vector3(...part.position),
    new Quaternion().setFromEuler(eulerOf(part.rotation)),
    new Vector3(1, 1, 1),
  )
  const box = new Box3(new Vector3(0, 0, 0), new Vector3(l, t, w)).applyMatrix4(m)
  // Remove floating-point noise from the 90° rotations
  box.min.set(round(box.min.x), round(box.min.y), round(box.min.z))
  box.max.set(round(box.max.x), round(box.max.y), round(box.max.z))
  return box
}

/** World size (x, y, z) of a part after rotation. */
export function worldSize(part: Part): Vec3 {
  const s = partBox(part).getSize(new Vector3())
  return [s.x, s.y, s.z]
}

/**
 * Rotate a part a quarter turn around a world axis while keeping the minimum
 * corner of its bounding box in place, so it doesn't jump across the scene.
 */
export function rotatePart(part: Part, axis: 0 | 1 | 2): Part {
  const before = partBox(part).min
  const q = new Quaternion().setFromEuler(eulerOf(part.rotation))
  const turn = new Quaternion().setFromAxisAngle(
    new Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0),
    Math.PI / 2,
  )
  const e = new Euler().setFromQuaternion(turn.multiply(q), 'XYZ')
  const rotation = [e.x, e.y, e.z].map((a) => (((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4)) as QuarterTurns
  const rotated: Part = { ...part, rotation }
  const after = partBox(rotated).min
  return {
    ...rotated,
    position: [
      round(part.position[0] + before.x - after.x),
      round(part.position[1] + before.y - after.y),
      round(part.position[2] + before.z - after.z),
    ],
  }
}

export function round(v: number, step = 0.5): number {
  return Math.round(v / step) * step || 0
}
