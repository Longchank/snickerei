/**
 * Snapping: picking corners, edges, face centres and part centres when
 * measuring, and lining up faces and centres when moving parts.
 * Works on parts' bounding boxes (notches and angled cuts are ignored).
 */
import type { AxisBox } from './geometry'
import type { SnapKind, SnapTypes, Vec3 } from './types'

export const DEFAULT_SNAP_TYPES: SnapTypes = { vertex: true, edge: true, face: true, center: true }

export const SNAP_LABEL: Record<SnapKind, string> = {
  vertex: 'Hörn',
  edgeMid: 'Kantens mitt',
  faceCenter: 'Ytans mitt',
  center: 'Delens mitt',
  edge: 'På kanten',
  face: 'På ytan',
}

/** Lower = preferred when several are within reach */
const PRIORITY: Record<SnapKind, number> = { vertex: 0, edgeMid: 1, faceCenter: 2, center: 3, edge: 4, face: 5 }

const ENABLED_BY: Record<SnapKind, keyof SnapTypes | null> = {
  vertex: 'vertex',
  edgeMid: 'edge',
  edge: 'edge',
  faceCenter: 'face',
  center: 'center',
  face: null,
}

export interface SnapCandidate {
  kind: SnapKind
  point: Vec3
}

const mid = (a: number, b: number) => (a + b) / 2

/** Closest point on segment a–b to p */
function closestOnSegment(a: Vec3, b: Vec3, p: Vec3): Vec3 {
  const d = [0, 1, 2].map((i) => b[i] - a[i])
  const len2 = d.reduce((s, v) => s + v * v, 0)
  const t = len2 ? Math.min(1, Math.max(0, d.reduce((s, v, i) => s + v * (p[i] - a[i]), 0) / len2)) : 0
  return [0, 1, 2].map((i) => a[i] + d[i] * t) as Vec3
}

/**
 * Snap targets on the face of `box` that was tapped at `hit` (whose normal is
 * along `axis`): its 4 corners, 4 edges (midpoint and nearest point), its
 * centre, and the centre of the whole part.
 */
export function pointCandidates(box: AxisBox, hit: Vec3, axis: 0 | 1 | 2): SnapCandidate[] {
  // Which side of the box was tapped
  const side = Math.abs(hit[axis] - box.min[axis]) <= Math.abs(hit[axis] - box.max[axis]) ? box.min[axis] : box.max[axis]
  const [u, v] = [0, 1, 2].filter((i) => i !== axis)
  const at = (uv: number, vv: number): Vec3 => {
    const p = [0, 0, 0] as Vec3
    p[axis] = side
    p[u] = uv
    p[v] = vv
    return p
  }
  const corners = [
    at(box.min[u], box.min[v]),
    at(box.max[u], box.min[v]),
    at(box.max[u], box.max[v]),
    at(box.min[u], box.max[v]),
  ]
  const out: SnapCandidate[] = corners.map((point) => ({ kind: 'vertex', point }))
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % 4]
    out.push({ kind: 'edgeMid', point: [0, 1, 2].map((k) => mid(a[k], b[k])) as Vec3 })
    out.push({ kind: 'edge', point: closestOnSegment(a, b, hit) })
  })
  out.push({ kind: 'faceCenter', point: at(mid(box.min[u], box.max[u]), mid(box.min[v], box.max[v])) })
  out.push({ kind: 'center', point: [0, 1, 2].map((k) => mid(box.min[k], box.max[k])) as Vec3 })
  return out
}

/**
 * Snap options for a tap, best first: those whose on-screen position is
 * within `thresholdPx` of the tap, by priority (corner, edge midpoint, face
 * centre, part centre, along an edge) and then distance. The plain tapped
 * spot always comes last, so the user can cycle back to it.
 */
export function chooseSnaps(
  candidates: SnapCandidate[],
  hit: Vec3,
  toScreen: (p: Vec3) => [number, number],
  tap: [number, number],
  thresholdPx: number,
  types: SnapTypes,
): SnapCandidate[] {
  const scored = candidates
    .filter((c) => {
      const key = ENABLED_BY[c.kind]
      return key === null || types[key]
    })
    .map((c) => {
      const [x, y] = toScreen(c.point)
      return { c, d: Math.hypot(x - tap[0], y - tap[1]) }
    })
    .filter((s) => s.d <= thresholdPx)
    .sort((a, b) => PRIORITY[a.c.kind] - PRIORITY[b.c.kind] || a.d - b.d)
  // One option per kind (the nearest), then the plain spot
  const seen = new Set<SnapKind>()
  const out: SnapCandidate[] = []
  for (const { c } of scored)
    if (!seen.has(c.kind)) {
      seen.add(c.kind)
      out.push(c)
    }
  out.push({ kind: 'face', point: hit })
  return out
}

// ---------------------------------------------------------------- moving parts

export interface SnapGuide {
  axis: 0 | 1 | 2
  kind: 'face' | 'center'
  /** Line from the moving part's feature to the target's, on the shared plane */
  from: Vec3
  to: Vec3
}

/**
 * Snap a moving box to nearby parts along the active axes: faces to faces
 * (touching or flush) and centres to centres or faces. Only parts within
 * `reach` count, so far-away parts don't pull it around. Returns the offset
 * and guide lines for what snapped.
 */
export function snapMove(
  box: AxisBox,
  others: AxisBox[],
  axes: [boolean, boolean, boolean],
  threshold: number,
  types: SnapTypes = DEFAULT_SNAP_TYPES,
  reach = 300,
): { offset: Vec3; guides: SnapGuide[] } {
  const near = others.filter((o) =>
    [0, 1, 2].every((i) => o.min[i] - reach <= box.max[i] && o.max[i] + reach >= box.min[i]),
  )
  // Corners and edges of an axis-aligned box lie on its faces, so they align the same way
  const faces = types.face || types.vertex || types.edge
  const offset: Vec3 = [0, 0, 0]
  const guides: SnapGuide[] = []
  const centreOf = (b: AxisBox) => [0, 1, 2].map((k) => mid(b.min[k], b.max[k])) as Vec3

  for (const i of [0, 1, 2] as const) {
    if (!axes[i]) continue
    const mine: [number, 'face' | 'center'][] = []
    if (faces) mine.push([box.min[i], 'face'], [box.max[i], 'face'])
    if (types.center) mine.push([mid(box.min[i], box.max[i]), 'center'])
    let best: { d: number; target: AxisBox; kind: 'face' | 'center'; value: number } | null = null
    for (const o of near) {
      const theirs: number[] = []
      if (faces) theirs.push(o.min[i], o.max[i])
      if (types.center) theirs.push(mid(o.min[i], o.max[i]))
      for (const [v, kind] of mine)
        for (const t of theirs) {
          const d = t - v
          // Prefer an exact face match over a centre match at the same distance
          const score = Math.abs(d) + (kind === 'center' ? 0.01 : 0)
          if (Math.abs(d) < threshold && (!best || score < Math.abs(best.d) + (best.kind === 'center' ? 0.01 : 0)))
            best = { d, target: o, kind, value: t }
        }
    }
    if (!best) continue
    offset[i] = best.d
    const a = centreOf(box)
    a[i] = best.value
    const b = centreOf(best.target)
    b[i] = best.value
    guides.push({ axis: i, kind: best.kind, from: a, to: b })
  }
  // Guides start from where the box will be after snapping
  for (const g of guides) for (const k of [0, 1, 2]) if (k !== g.axis) g.from[k] += offset[k]
  return { offset, guides }
}
