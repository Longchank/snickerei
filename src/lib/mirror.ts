/**
 * Mirroring parts across a plane (x = c, y = c or z = c). Boards are
 * symmetric, so a part keeps its rotation and moves to its mirror place;
 * what isn't symmetric is mirrored with it: angled end cuts, notches and
 * the rip of a French cleat.
 */
import { partBox, partSize, round, toAxisBox } from './geometry'
import { worldAxisOf } from './place'
import type { EndCut, Part, Vec3 } from './types'

type Axis = 0 | 1 | 2

/** Which of the part's own axes (0 length, 1 thickness, 2 width) lies along a world axis */
function localAxis(part: Part, world: Axis): Axis {
  return ([0, 1, 2] as Axis[]).find((k) => worldAxisOf(part.rotation, k) === world)!
}

/** One part mirrored across the plane `axis = at` */
export function mirrorPart(part: Part, axis: Axis, at: number): Part {
  const k = localAxis(part, axis)
  const size = partSize(part)
  let ends = part.ends
  if (ends) {
    if (k === 0) ends = [ends[1], ends[0]] // along the length: the ends swap
    else {
      // Across the cut: the long point moves to the other side
      const flip = (c: EndCut | null): EndCut | null =>
        c && ((c.plane === 'face' && k === 2) || (c.plane === 'edge' && k === 1)) ? { ...c, angle: -c.angle } : c
      ends = [flip(ends[0]), flip(ends[1])]
    }
  }
  const notches = part.notches?.map((n) => {
    const min = [...n.min] as Vec3
    const max = [...n.max] as Vec3
    min[k] = size[k] - n.max[k]
    max[k] = size[k] - n.min[k]
    return { ...n, min, max }
  })
  let rip = part.rip
  if (rip && k !== 0) rip = { ...rip, angle: -rip.angle, half: k === 2 ? ((1 - rip.half) as 0 | 1) : rip.half }
  const b = toAxisBox(partBox(part))
  const shift = 2 * at - b.max[axis] - b.min[axis]
  const position = [...part.position] as Vec3
  position[axis] = round(position[axis] + shift)
  return {
    ...part,
    position,
    ...(part.ends ? { ends } : {}),
    ...(part.notches ? { notches } : {}),
    ...(part.rip ? { rip } : {}),
  }
}

export const mirrorParts = (parts: Part[], axis: Axis, at: number) => parts.map((p) => mirrorPart(p, axis, at))

/**
 * Where a mirrored copy of `sel` goes: across the middle of the whole build,
 * so the left side lands on the right — unless the selection reaches over the
 * middle, then right next to it (mirrored across its own far face).
 */
export function copyPlane(sel: { min: Vec3; max: Vec3 }, all: { min: Vec3; max: Vec3 }, axis: Axis): number {
  const mid = (all.min[axis] + all.max[axis]) / 2
  const reaches = sel.min[axis] < mid - 0.5 && sel.max[axis] > mid + 0.5
  if (!reaches) return mid
  return sel.max[axis]
}
