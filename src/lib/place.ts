/**
 * Placing a new board by tapping where it should go: on an existing part
 * (snapping to its start, centre or end) or on the floor. Works on bounding
 * boxes; all parts are axis-aligned.
 */
import { Vector3 } from 'three'
import { getProfile } from './catalog'
import { eulerOf, partBox, toAxisBox, type AxisBox } from './geometry'
import type { Part, QuarterTurns, Vec3 } from './types'

type Axis = 0 | 1 | 2
const AXES: Axis[] = [0, 1, 2]
const DEFAULT_LENGTH = 1000
/** How far ahead to look for a part to fill up to or span across */
const REACH = 3000

/** Where along the tapped part the new board was anchored */
export type Anchor = 'start' | 'mid' | 'end' | 'free'

export const ANCHOR_LABEL: Record<Anchor, string> = {
  start: 'Vid början',
  mid: 'I mitten',
  end: 'Vid änden',
  free: 'Där du tryckte',
}

export interface Placement {
  part: Omit<Part, 'id' | 'name'>
  anchor: Anchor
  /** Name of the part the length was taken from, if any */
  lengthFrom?: string
  lengthReason?: 'fill' | 'span'
}

/** World axis a local axis points along after rotation */
export function worldAxisOf(rotation: QuarterTurns, local: Axis): Axis {
  const v = new Vector3(local === 0 ? 1 : 0, local === 1 ? 1 : 0, local === 2 ? 1 : 0).applyEuler(eulerOf(rotation))
  const c = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)]
  return c.indexOf(Math.max(...c)) as Axis
}

/** A quarter-turn rotation that lays the length along `lengthAxis` and the width along `widthAxis`. */
export function rotationFor(lengthAxis: Axis, widthAxis: Axis): QuarterTurns {
  for (let x = 0; x < 4; x++)
    for (let y = 0; y < 4; y++)
      for (let z = 0; z < 4; z++) {
        const r: QuarterTurns = [x, y, z]
        if (worldAxisOf(r, 0) === lengthAxis && worldAxisOf(r, 2) === widthAxis) return r
      }
  return [0, 0, 0]
}

/** A part of this profile whose bounding box starts at `min`. */
function partAt(profileId: string, length: number, rotation: QuarterTurns, min: Vec3): Omit<Part, 'id' | 'name'> {
  const prof = getProfile(profileId)
  const base = {
    profileId,
    length,
    ...(prof.kind === 'sheet' ? { width: prof.width } : {}),
    rotation,
    position: [0, 0, 0] as Vec3,
  }
  const at0 = toAxisBox(partBox({ ...base, id: '', name: '' }))
  return { ...base, position: [0, 1, 2].map((i) => Math.round((min[i] - at0.min[i]) * 10) / 10) as Vec3 }
}

/** Cross-section of the new board: [width, thickness] */
function section(profileId: string): [number, number] {
  const prof = getProfile(profileId)
  return [prof.width, prof.thickness]
}

/**
 * Parts ahead of `start` along `axis` (in direction `sign`) whose outline
 * overlaps the footprint (the other two axes) of the board being placed.
 */
function ahead(others: Part[], axis: Axis, sign: 1 | -1, start: number, footprint: AxisBox) {
  const rest = AXES.filter((i) => i !== axis)
  return others
    .map((p) => ({ p, b: toAxisBox(partBox(p)) }))
    .filter(({ b }) => rest.every((i) => b.max[i] > footprint.min[i] + 0.5 && b.min[i] < footprint.max[i] - 0.5))
    .map(({ p, b }) => ({
      p,
      near: sign > 0 ? b.min[axis] - start : start - b.max[axis],
      far: sign > 0 ? b.max[axis] - start : start - b.min[axis],
    }))
    .filter((o) => o.far > 1 && o.near < REACH)
}

/**
 * Place a new board on the face of `target` that was tapped at `hit` with
 * outward normal `normal`.
 * - Tapping a side face: the new board stands out from it (a post on a sill),
 *   at the start, centre or end of the target, and fills up to the next part
 *   in its way.
 * - Tapping an end face: the new board turns 90° and runs towards the rest of
 *   the model (a top rail on a post), spanning the parts in its way.
 */
export function placeOnPart(
  profileId: string,
  target: Part,
  hit: Vec3,
  normal: Vec3,
  parts: Part[],
  /** End-face taps: run this way instead of towards the rest of the model */
  forceDir?: { axis: Axis; sign: 1 | -1 },
): Placement {
  const others = parts.filter((p) => p.id !== target.id)
  const tBox = toAxisBox(partBox(target))
  const n = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))) as Axis
  const nSign: 1 | -1 = normal[n] >= 0 ? 1 : -1
  const face = nSign > 0 ? tBox.max[n] : tBox.min[n]
  const tLength = worldAxisOf(target.rotation, 0)
  const tWidth = worldAxisOf(target.rotation, 2)
  const tThick = worldAxisOf(target.rotation, 1)
  const [W, T] = section(profileId)

  const min: Vec3 = [0, 0, 0]
  let lengthAxis: Axis
  let widthAxis: Axis
  let length = DEFAULT_LENGTH
  let anchor: Anchor = 'free'
  let lengthFrom: string | undefined
  let lengthReason: Placement['lengthReason']

  if (n !== tLength) {
    // ---- side face: stand out from it
    lengthAxis = n
    widthAxis = tWidth !== n ? tWidth : tThick
    const ext = (a: Axis) => (a === widthAxis ? W : T)

    // Along the target's length: snap to start, centre or end
    const a = tLength
    const tLen = tBox.max[a] - tBox.min[a]
    const f = (hit[a] - tBox.min[a]) / (tLen || 1)
    anchor = f <= 0.25 ? 'start' : f >= 0.75 ? 'end' : f >= 0.375 && f <= 0.625 ? 'mid' : 'free'
    const e = ext(a)
    min[a] =
      anchor === 'start'
        ? tBox.min[a]
        : anchor === 'end'
          ? tBox.max[a] - e
          : anchor === 'mid'
            ? (tBox.min[a] + tBox.max[a]) / 2 - e / 2
            : Math.round(hit[a] / 5) * 5 - e / 2
    // The remaining direction: flush with the target's lower side
    const r = AXES.find((x) => x !== lengthAxis && x !== a)!
    min[r] = tBox.min[r]

    // Length: fill up to the nearest part in the way
    const fp: AxisBox = { min: [...min], max: [...min] }
    for (const x of [a, r]) fp.max[x] = min[x] + ext(x)
    const hits = ahead(others, n, nSign, face, fp).filter((o) => o.near > 10)
    if (hits.length) {
      const nearest = hits.reduce((m, o) => (o.near < m.near ? o : m))
      length = Math.round(nearest.near)
      lengthFrom = nearest.p.name
      lengthReason = 'fill'
    }
    min[n] = nSign > 0 ? face : face - length
  } else {
    // ---- end face: turn 90° and run towards the rest of the model
    const candidates = AXES.filter((a) => a !== n)
    const centre = (b: AxisBox) => [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2)
    const tC = centre(tBox)
    let dir: Axis = tWidth !== n ? tWidth : candidates[0]
    let dSign: 1 | -1 = 1
    if (forceDir) {
      dir = forceDir.axis
      dSign = forceDir.sign
    } else if (others.length) {
      const boxes = others.map((p) => centre(toAxisBox(partBox(p))))
      const avg = [0, 1, 2].map((i) => boxes.reduce((s, c) => s + c[i], 0) / boxes.length)
      const best = candidates.reduce((m, a) => (Math.abs(avg[a] - tC[a]) > Math.abs(avg[m] - tC[m]) ? a : m))
      if (Math.abs(avg[best] - tC[best]) > 1) {
        dir = best
        dSign = avg[best] >= tC[best] ? 1 : -1
      }
    }
    lengthAxis = dir
    const r = candidates.find((a) => a !== dir)!
    // Lie flat on the end: width across the target's footprint, thickness up from the face
    widthAxis = r
    anchor = nSign > 0 ? 'end' : 'start'
    min[n] = nSign > 0 ? face : face - T
    min[r] = tBox.min[r]
    const start = dSign > 0 ? tBox.min[dir] : tBox.max[dir]

    // Length: span across the parts in the way (flush with the farthest one's far side)
    const fp: AxisBox = { min: [...min], max: [...min] }
    fp.max[n] = min[n] + T
    fp.max[r] = min[r] + W
    // Look just below the new board too, so it spans the posts it rests on
    fp.min[n] -= nSign > 0 ? 50 : 0
    fp.max[n] += nSign > 0 ? 0 : 50
    const hits = ahead(others, dir, dSign, start, fp).filter((o) => o.far > Math.max(W, T))
    if (hits.length) {
      const farthest = hits.reduce((m, o) => (o.far > m.far ? o : m))
      length = Math.round(farthest.far)
      lengthFrom = farthest.p.name
      lengthReason = 'span'
    }
    min[dir] = dSign > 0 ? start : start - length
  }

  return { part: partAt(profileId, length, rotationFor(lengthAxis, widthAxis), min), anchor, lengthFrom, lengthReason }
}

/**
 * A floor tap right next to (or under) a part that stands on the floor is
 * almost always a slightly missed tap on that part: return the part and the
 * point on its top, so the new board goes on it. `margin` in mm.
 */
export function floorTapTarget(hit: Vec3, parts: Part[], margin = 60): { part: Part; hit: Vec3 } | null {
  let best: { part: Part; hit: Vec3; d: number } | null = null
  for (const part of parts) {
    const b = toAxisBox(partBox(part))
    if (b.min[1] > 1) continue
    const dx = Math.max(b.min[0] - hit[0], 0, hit[0] - b.max[0])
    const dz = Math.max(b.min[2] - hit[2], 0, hit[2] - b.max[2])
    const d = Math.hypot(dx, dz)
    if (d > margin || (best && d >= best.d)) continue
    const x = Math.min(b.max[0], Math.max(b.min[0], hit[0]))
    const z = Math.min(b.max[2], Math.max(b.min[2], hit[2]))
    best = { part, hit: [x, b.max[1], z], d }
  }
  return best ? { part: best.part, hit: best.hit } : null
}

/**
 * All sensible ways to place a board from one tap, best first: as tapped,
 * then the other directions — so the user can cycle when the guess is wrong.
 * `missed`: the tap only came near the target (a slightly missed tap), so
 * standing on top of it is the likeliest intent.
 */
export function placementOptions(
  profileId: string,
  target: Part,
  hit: Vec3,
  normal: Vec3,
  parts: Part[],
  missed = false,
): Placement[] {
  const tBox = toAxisBox(partBox(target))
  const tLength = worldAxisOf(target.rotation, 0)
  const n = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))) as Axis
  const out: Placement[] = []
  const add = (p: Placement) => {
    const key = JSON.stringify([p.part.position, p.part.rotation, p.part.length])
    if (!out.some((o) => JSON.stringify([o.part.position, o.part.rotation, o.part.length]) === key)) out.push(p)
  }
  /** The tap moved onto another face of the target, keeping its spot along the length */
  const onFace = (axis: Axis, sign: 1 | -1): [Vec3, Vec3] => {
    const h = [...hit] as Vec3
    h[axis] = sign > 0 ? tBox.max[axis] : tBox.min[axis]
    const nn: Vec3 = [0, 0, 0]
    nn[axis] = sign
    return [h, nn]
  }
  const sides: [Axis, 1 | -1][] = []
  for (const a of AXES) if (a !== tLength) sides.push([a, 1], [a, -1])
  // Up first among the alternatives: posts are the commonest case
  sides.sort(([a, s], [b, t]) => Number(b === 1 && t === 1) - Number(a === 1 && s === 1))

  if (missed && n !== tLength && tLength !== 1) add(placeOnPart(profileId, target, ...onFace(1, 1), parts))
  add(placeOnPart(profileId, target, hit, normal, parts))
  if (n === tLength) {
    // End face: the other ways a rail could run from here
    for (const a of AXES) if (a !== n) for (const sg of [1, -1] as const) add(placeOnPart(profileId, target, hit, normal, parts, { axis: a, sign: sg }))
  }
  for (const [a, sg] of sides) add(placeOnPart(profileId, target, ...onFace(a, sg), parts))
  // Nothing goes through the floor (unless the target itself is below it)
  if (tBox.min[1] >= 0) {
    const above = out.filter((p) => toAxisBox(partBox({ ...p.part, id: '', name: '' })).min[1] >= -0.5)
    if (above.length) return above
  }
  return out
}

/** Place a new board flat on the floor where it was tapped. */
export function placeOnFloor(profileId: string, hit: Vec3): Placement {
  const min: Vec3 = [Math.round(hit[0] / 5) * 5, 0, Math.round(hit[2] / 5) * 5]
  const length = getProfile(profileId).kind === 'sheet' ? 800 : DEFAULT_LENGTH
  return { part: partAt(profileId, length, [0, 0, 0], min), anchor: 'free' }
}

/** "Vid änden · 1130 mm, spänner till Stolpe 2" */
export function describePlacement(p: Placement): string {
  const len = `${Math.round(p.part.length)} mm`
  const why = p.lengthFrom
    ? p.lengthReason === 'span'
      ? `, spänner till ${p.lengthFrom}`
      : `, fyller upp till ${p.lengthFrom}`
    : ''
  return `${lie(p.part)}, ${ANCHOR_LABEL[p.anchor].toLowerCase()} · ${len}${why}`
}

/** "Stående", "Liggande" or "På högkant", from which way the length and width run */
function lie(part: Omit<Part, 'id' | 'name'>): string {
  if (worldAxisOf(part.rotation, 0) === 1) return 'Stående'
  return worldAxisOf(part.rotation, 2) === 1 ? 'På högkant' : 'Liggande'
}

/**
 * What an already-placed board sits on: the part whose face it touches, the
 * middle of the contact and the face's outward normal — as if that spot had
 * been tapped when placing. Contact at the board's own end comes first (a
 * post on a sill), then the biggest contact area. Null if it touches nothing.
 */
export function contactOf(board: Part, parts: Part[]): { target: Part; hit: Vec3; normal: Vec3 } | null {
  const b = toAxisBox(partBox(board))
  const length = worldAxisOf(board.rotation, 0)
  let best: { target: Part; hit: Vec3; normal: Vec3; score: number } | null = null
  for (const q of parts) {
    if (q.id === board.id || (board.rip && q.rip?.id === board.rip.id)) continue
    const t = toAxisBox(partBox(q))
    for (const a of AXES) {
      for (const sign of [1, -1] as const) {
        // Board on the + side of q (touching q's max face) or on the − side
        const gap = sign > 0 ? b.min[a] - t.max[a] : t.min[a] - b.max[a]
        if (Math.abs(gap) > 1) continue
        const rest = AXES.filter((x) => x !== a)
        const over = rest.map((x) => [Math.max(b.min[x], t.min[x]), Math.min(b.max[x], t.max[x])])
        if (over.some(([lo, hi]) => hi - lo <= 0.5)) continue
        const hit = [0, 0, 0] as Vec3
        hit[a] = sign > 0 ? t.max[a] : t.min[a]
        rest.forEach((x, k) => (hit[x] = (over[k][0] + over[k][1]) / 2))
        const normal = [0, 0, 0] as Vec3
        normal[a] = sign
        const area = over.reduce((s, [lo, hi]) => s * (hi - lo), 1)
        const score = (a === length ? 1e12 : 0) + area
        if (!best || score > best.score) best = { target: q, hit, normal, score }
      }
    }
  }
  return best && { target: best.target, hit: best.hit, normal: best.normal }
}

/**
 * Other ways to place an existing board, from what it sits on (see
 * `contactOf`) — the same alternatives as "Annan riktning" while placing.
 * Empty for sheets and boards that touch nothing.
 */
export function reorientOptions(board: Part, parts: Part[]): Placement[] {
  if (getProfile(board.profileId).kind === 'sheet') return []
  const others = parts.filter((p) => p.id !== board.id)
  const c = contactOf(board, others)
  if (!c) return []
  return placementOptions(board.profileId, c.target, c.hit, c.normal, others)
}

/** Same position, turn and length? */
export const samePlacement = (a: Omit<Part, 'id' | 'name'>, b: Omit<Part, 'id' | 'name'>) =>
  JSON.stringify([a.position, a.rotation, a.length]) === JSON.stringify([b.position, b.rotation, b.length])

/** The first corner tapped when placing a sheet, and the surface it lies on */
export interface SheetCorner {
  point: Vec3
  /** The surface's normal axis and which way it faces */
  axis: Axis
  sign: 1 | -1
}

/**
 * A sheet spanning the rectangle between two tapped corners, lying on the
 * first corner's surface (on the floor, on top of a frame, against the side
 * of a post). The second corner is projected onto that surface. The longer
 * side becomes the sheet's length. Null if the rectangle is too small.
 */
export function sheetBetween(profileId: string, a: SheetCorner, b: Vec3, minSize = 20): Omit<Part, 'id' | 'name'> | null {
  const prof = getProfile(profileId)
  const [u, v] = AXES.filter((i) => i !== a.axis)
  const du = Math.abs(b[u] - a.point[u])
  const dv = Math.abs(b[v] - a.point[v])
  if (du < minSize || dv < minSize) return null
  const [lengthAxis, widthAxis] = du >= dv ? [u, v] : [v, u]
  const rotation = rotationFor(lengthAxis, widthAxis)
  const min = [0, 0, 0] as Vec3
  min[u] = Math.min(a.point[u], b[u])
  min[v] = Math.min(a.point[v], b[v])
  min[a.axis] = a.sign > 0 ? a.point[a.axis] : a.point[a.axis] - prof.thickness
  const part: Omit<Part, 'id' | 'name'> = {
    profileId,
    length: Math.round(Math.max(du, dv)),
    width: Math.round(Math.min(du, dv)),
    position: [0, 0, 0],
    rotation,
  }
  const box = toAxisBox(partBox({ ...part, id: '', name: '' }))
  part.position = [0, 1, 2].map((i) => Math.round((min[i] - box.min[i]) * 10) / 10) as Vec3
  return part
}
