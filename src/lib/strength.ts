/**
 * Hobby-level strength estimates for a finished build ("Analys"): weight,
 * tipping, sideways wobble (racking), and per horizontal part how much it
 * sags and how much it can carry.
 *
 * Everything works on axis-aligned bounding boxes and textbook beam formulas
 * (simply supported spans and cantilevers). Material values are typical
 * figures (EN 338 classes for timber, rough values for sheets) from general
 * knowledge — not verified per product. Joints, notches, glue and screws are
 * not modelled. The UI must present all of this as an estimate
 * ("uppskattning"), never as a guarantee.
 */
import { getProfile } from './catalog'
import { partBox, toAxisBox, type AxisBox } from './geometry'
import type { Part, ProfileCategory, Purpose } from './types'

type Axis = 0 | 1 | 2
const G = 9.81
const TOL = 1

// ---------------------------------------------------------------- data

export interface Material {
  /** Characteristic bending strength, MPa */
  fm: number
  /** Characteristic compression strength along the grain, MPa */
  fc: number
  /** Mean modulus of elasticity, MPa */
  E: number
  /** Mean density, kg/m³ */
  density: number
  /** Creep factor for long-term loads */
  kdef: number
  label: string
}

/** Typical values per category (rounded, from general knowledge, not per product) */
export const MATERIALS: Record<ProfileCategory, Material> = {
  konstruktion: { fm: 24, fc: 21, E: 11000, density: 420, kdef: 0.6, label: 'C24' },
  tryckimpregnerat: { fm: 24, fc: 21, E: 11000, density: 480, kdef: 0.6, label: 'C24, impregnerat' },
  hyvlat: { fm: 18, fc: 18, E: 9000, density: 400, kdef: 0.6, label: 'ca C18' },
  lakt: { fm: 14, fc: 16, E: 7000, density: 350, kdef: 0.6, label: 'ca C14' },
  plywood: { fm: 25, fc: 20, E: 8000, density: 550, kdef: 0.8, label: 'plywood' },
  osb: { fm: 16, fc: 15, E: 4900, density: 600, kdef: 1.5, label: 'OSB/3' },
  mdf: { fm: 18, fc: 12, E: 2500, density: 750, kdef: 2.25, label: 'MDF' },
}

/** Share of the characteristic strength we allow (≈ kmod 0.8 / γM 1.3) */
const STRENGTH_SHARE = 0.6

export interface PurposeInfo {
  label: string
  /** Spread load on every free top surface, kg/m² */
  kgPerM2: number
  /** A person (or heavy object) on one spot, checked separately, kg */
  pointKg: number
  /** Loads stay for a long time (books): wood creeps */
  longTerm: boolean
  hint: string
}

/** Load presets. Typical hobby values, not building-code figures. */
export const PURPOSES: Record<Purpose, PurposeInfo> = {
  bokhylla: { label: 'Bokhylla', kgPerM2: 130, pointKg: 0, longTerm: true, hint: 'böcker, ca 40 kg per meter hylla' },
  forvaring: { label: 'Förvaring', kgPerM2: 100, pointKg: 0, longTerm: true, hint: 'lådor och prylar som står länge' },
  bord: { label: 'Bord', kgPerM2: 50, pointKg: 60, longTerm: false, hint: 'saker på bordet, någon som lutar sig' },
  bank: { label: 'Bänk / sittplats', kgPerM2: 200, pointKg: 120, longTerm: false, hint: 'personer som sitter, någon som står' },
  arbetsbank: { label: 'Arbetsbänk', kgPerM2: 150, pointKg: 100, longTerm: false, hint: 'verktyg, material och slag' },
}

// ---------------------------------------------------------------- helpers

const boxOf = (p: Part) => toAxisBox(partBox(p))
const size = (b: AxisBox) => [0, 1, 2].map((i) => b.max[i] - b.min[i])
const overlap = (a: AxisBox, b: AxisBox, i: number) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i])
const kindOf = (p: Part) => getProfile(p.profileId).kind
const material = (p: Part) => MATERIALS[getProfile(p.profileId).category]

/** Volume in m³ (bounding box; angled cuts and notches ignored) */
const volume = (b: AxisBox) => size(b).reduce((v, s) => v * s, 1) * 1e-9

export const partWeightKg = (p: Part) => volume(boxOf(p)) * material(p).density

/** A horizontal part that can bend: a board lying down, or a sheet lying flat */
function isHorizontal(p: Part, b: AxisBox): boolean {
  const s = size(b)
  if (kindOf(p) === 'sheet') return s[1] <= Math.min(s[0], s[2])
  return s[1] < Math.max(s[0], s[2])
}

interface Contact {
  other: Part
  /** Interval along the part's span axis, in local coordinates from b.min */
  from: number
  to: number
  /** Where along the other part's own span axis the load lands (world coord on all axes) */
  centre: [number, number, number]
}

/** Parts that hold `p` up: under it, or beside it reaching lower (legs, posts) */
/** A board's long horizontal axis (x or z), or null for sheets and standing boards */
function lengthAxisOf(p: Part, b: AxisBox): 0 | 2 | null {
  if (kindOf(p) === 'sheet' || !isHorizontal(p, b)) return null
  const s = size(b)
  return s[0] >= s[2] ? 0 : 2
}

/**
 * p's end butts against q's side (a joist into a rail, an end rail between
 * two long rails): a screwed joint that carries p, even at the same height.
 * Not two boards end to end — q must run across p.
 */
function buttsInto(p: Part, b: AxisBox, q: Part, c: AxisBox): boolean {
  const h = lengthAxisOf(p, b)
  if (h === null || lengthAxisOf(q, c) === h) return false
  const across = h === 0 ? 2 : 0
  const touching = Math.abs(b.min[h] - c.max[h]) <= TOL || Math.abs(c.min[h] - b.max[h]) <= TOL
  return touching && overlap(b, c, 1) > 0.5 && overlap(b, c, across) > 0.5
}

function supportsOf(p: Part, b: AxisBox, axis: Axis, parts: Part[]): Contact[] {
  const out: Contact[] = []
  for (const q of parts) {
    if (q.id === p.id) continue
    const c = boxOf(q)
    let ok = false
    // Resting on q
    if (Math.abs(b.min[1] - c.max[1]) <= TOL && overlap(b, c, 0) > 0.5 && overlap(b, c, 2) > 0.5) ok = true
    // Fixed to the side of something reaching further down (a leg or post)
    if (!ok && c.min[1] < b.min[1] - TOL && overlap(b, c, 1) > 0.5) {
      for (const h of [0, 2] as const) {
        const other = h === 0 ? 2 : 0
        const touching = Math.abs(b.min[h] - c.max[h]) <= TOL || Math.abs(c.min[h] - b.max[h]) <= TOL
        if (touching && overlap(b, c, other) > -TOL) ok = true
      }
    }
    // Its end screwed to the side of a board running across it
    if (!ok && buttsInto(p, b, q, c)) ok = true
    if (!ok) continue
    const from = Math.max(b.min[axis], c.min[axis]) - b.min[axis]
    const to = Math.min(b.max[axis], c.max[axis]) - b.min[axis]
    const L = b.max[axis] - b.min[axis]
    const f = Math.max(0, Math.min(L, from))
    const t = Math.max(0, Math.min(L, to))
    const centre = [0, 1, 2].map((i) => (Math.max(b.min[i], c.min[i]) + Math.min(b.max[i], c.max[i])) / 2) as [number, number, number]
    out.push({ other: q, from: Math.min(f, t), to: Math.max(f, t), centre })
  }
  return out
}

/** How much of p's top is covered by parts resting on it (0..1) */
function topCovered(p: Part, b: AxisBox, parts: Part[]): number {
  const area = size(b)[0] * size(b)[2]
  let covered = 0
  for (const q of parts) {
    if (q.id === p.id) continue
    const c = boxOf(q)
    if (Math.abs(c.min[1] - b.max[1]) > TOL) continue
    const ox = overlap(b, c, 0)
    const oz = overlap(b, c, 2)
    if (ox > 0 && oz > 0) covered += ox * oz
  }
  return Math.min(1, covered / area)
}

// ---------------------------------------------------------------- beam formulas

interface Load {
  /** Position along the span, mm from the left support (or from the support for a cantilever) */
  at: number
  /** Newton */
  P: number
}

interface SpanResult {
  /** Max moment, N·mm */
  M: number
  /** Max deflection, mm */
  d: number
}

/** Simply supported span L: uniform w (N/mm) plus point loads */
function simpleSpan(L: number, w: number, loads: Load[], EI: number): SpanResult {
  const pts = loads.filter((l) => l.at >= 0 && l.at <= L)
  const RA = (w * L) / 2 + pts.reduce((s, l) => s + (l.P * (L - l.at)) / L, 0)
  const xs = new Set<number>()
  for (let i = 0; i <= 40; i++) xs.add((L * i) / 40)
  pts.forEach((l) => xs.add(l.at))
  let M = 0
  let d = 0
  for (const x of xs) {
    const m = RA * x - (w * x * x) / 2 - pts.reduce((s, l) => s + (x > l.at ? l.P * (x - l.at) : 0), 0)
    M = Math.max(M, m)
    let y = (w * x * (L ** 3 - 2 * L * x * x + x ** 3)) / (24 * EI)
    for (const { at: a, P } of pts) {
      const bb = L - a
      y += x <= a ? (P * bb * x * (L * L - bb * bb - x * x)) / (6 * L * EI) : (P * a * (L - x) * (2 * L * x - x * x - a * a)) / (6 * L * EI)
    }
    d = Math.max(d, y)
  }
  return { M, d }
}

/** Cantilever of length a from its support: uniform w plus point loads */
function cantilever(a: number, w: number, loads: Load[], EI: number): SpanResult {
  const pts = loads.filter((l) => l.at >= 0 && l.at <= a)
  const M = (w * a * a) / 2 + pts.reduce((s, l) => s + l.P * l.at, 0)
  const d = (w * a ** 4) / (8 * EI) + pts.reduce((s, l) => s + (l.P * l.at * l.at * (3 * a - l.at)) / (6 * EI), 0)
  return { M, d }
}

// ---------------------------------------------------------------- analysis

export type Status = 'ok' | 'warn' | 'bad'

export const STATUS_COLOR: Record<Status, string> = { ok: '#22c55e', warn: '#facc15', bad: '#ef4444' }
export const STATUS_LABEL: Record<Status, string> = { ok: 'Håller', warn: 'Gränsfall', bad: 'För svag' }

export interface BeamResult {
  partId: string
  name: string
  /** Longest free span (or overhang), mm */
  span: number
  cantilever: boolean
  /** Sag under the preset load (incl. creep for long-term loads), mm */
  sag: number
  /** Sag that is still fine: span/300 (overhang: length/150) */
  sagLimit: number
  /** Stress / allowed stress, 1 = at the limit */
  utilisation: number
  /** Extra load it takes on one spot in the middle of the span (tip of an overhang), kg */
  capacityKg: number
  /** What sets that limit: sagging too much, or the wood's strength */
  capacityBy: 'sag' | 'strength'
  /** Load it gets from the preset, kg (own weight excluded) */
  loadKg: number
  status: Status
}

export interface PostResult {
  partId: string
  name: string
  /** Free height (buckling length), mm */
  height: number
  /** Load from above, own weight included, kg */
  loadKg: number
  /** What it takes before buckling or crushing, kg */
  capacityKg: number
  /** Buckling (bends out sideways) or crushing (the wood itself) sets the limit */
  capacityBy: 'buckling' | 'crushing'
  utilisation: number
  status: Status
}

export interface TipResult {
  /** Least sideways push at the top that tips it, kg (0 = falls by itself) */
  pushKg: number
  /** Which way it tips most easily */
  direction: string
  height: number
  status: Status
}

export interface RackResult {
  /** Horizontal directions with nothing stiff (a standing sheet) against wobble */
  unbraced: string[]
  status: Status
}

export interface Analysis {
  weightKg: number
  centre: [number, number, number]
  onFloor: boolean
  beams: BeamResult[]
  /** Standing boards: legs and posts */
  posts: PostResult[]
  /** Horizontal parts that touch nothing below them */
  floating: string[]
  tip: TipResult | null
  rack: RackResult | null
}

const DIR_NAMES: Record<string, string> = { '0-': 'åt vänster', '0+': 'åt höger', '2-': 'bakåt', '2+': 'framåt' }

export function analyse(parts: Part[], purpose: Purpose): Analysis {
  const preset = PURPOSES[purpose]
  const boxes = new Map(parts.map((p) => [p.id, boxOf(p)]))
  // ---- weight and centre of gravity (empty build)
  let weightKg = 0
  const centre: [number, number, number] = [0, 0, 0]
  for (const p of parts) {
    const b = boxes.get(p.id)!
    const kg = volume(b) * material(p).density
    weightKg += kg
    for (const i of [0, 1, 2]) centre[i] += kg * (b.min[i] + b.max[i]) / 2
  }
  if (weightKg > 0) for (const i of [0, 1, 2]) centre[i] /= weightKg

  // ---- loads flow from the top down: each part passes its load to what holds it up
  const received = new Map<string, { dead: { pos: [number, number, number]; N: number }[]; live: { pos: [number, number, number]; N: number }[] }>()
  const inbox = (id: string) => {
    if (!received.has(id)) received.set(id, { dead: [], live: [] })
    return received.get(id)!
  }
  const beams: BeamResult[] = []
  const posts: PostResult[] = []
  const floating: string[] = []
  // Top down, so loads are passed on before the part below is checked. At the
  // same height, a part hanging on another by its end (a joist on a rail)
  // goes before it: depth = how long the chain of such joints below it is.
  const depth = new Map<string, number>()
  const hangsOn = new Map(
    parts.map((p) => [p.id, parts.filter((q) => q.id !== p.id && buttsInto(p, boxes.get(p.id)!, q, boxes.get(q.id)!))]),
  )
  const depthOf = (p: Part, seen = new Set<string>()): number => {
    if (depth.has(p.id)) return depth.get(p.id)!
    if (seen.has(p.id)) return 0
    seen.add(p.id)
    const d = Math.max(0, ...hangsOn.get(p.id)!.map((q) => depthOf(q, seen) + 1))
    depth.set(p.id, d)
    return d
  }
  const order = [...parts].sort(
    (a, b) => boxes.get(b.id)!.max[1] - boxes.get(a.id)!.max[1] || depthOf(b) - depthOf(a),
  )

  for (const p of order) {
    const b = boxes.get(p.id)!
    const mat = material(p)
    const s = size(b)
    const own = volume(b) * mat.density * G
    const got = inbox(p.id)
    const horizontal = isHorizontal(p, b)
    const onFloor = b.min[1] <= 0.5
    const exposed = horizontal && topCovered(p, b, parts) < 0.5
    // An own load set on the part replaces the preset there (and no person load)
    const own_kg = horizontal ? p.loadKg : undefined
    const liveSpread = own_kg !== undefined ? own_kg * G : exposed ? preset.kgPerM2 * (s[0] * s[2] * 1e-6) * G : 0
    const personKg = own_kg !== undefined ? 0 : exposed ? preset.pointKg : 0

    // Which way does it span? Boards: their length. Sheets: the shorter gap between supports.
    const lengthAxis: Axis = s[0] >= s[2] ? 0 : 2
    let axis: Axis = lengthAxis
    let supports = !onFloor ? supportsOf(p, b, axis, parts) : []
    if (horizontal && !onFloor && kindOf(p) === 'sheet') {
      const other: Axis = lengthAxis === 0 ? 2 : 0
      const gapOf = (ax: Axis, cs: Contact[]) => spans(merge(cs), b.max[ax] - b.min[ax]).inner.reduce((m, sp) => Math.max(m, sp.to - sp.from), 0)
      const sOther = supportsOf(p, b, other, parts)
      const gA = gapOf(axis, supports)
      const gB = gapOf(other, sOther)
      if (gB > 0 && (gA === 0 || gB < gA)) {
        axis = other
        supports = sOther
      }
    }

    // Everything this part carries, to pass on
    const passDown = (N: number, kind: 'dead' | 'live', pos?: [number, number, number]) => {
      if (onFloor || !supports.length) return
      // Split by nearness: each support takes what lies closest to it
      const targets = pos
        ? [supports.reduce((best, c) => (Math.abs(c.centre[axis] - pos[axis]) < Math.abs(best.centre[axis] - pos[axis]) ? c : best))]
        : supports
      for (const c of targets) inbox(c.other.id)[kind].push({ pos: c.centre, N: N / targets.length })
    }

    if (!horizontal) {
      // Posts, legs, standing sheets: pass everything straight down
      passDown(own, 'dead')
      got.dead.forEach((l) => passDown(l.N, 'dead'))
      got.live.forEach((l) => passDown(l.N, 'live'))
      const carried = got.dead.reduce((t, l) => t + l.N, 0) + got.live.reduce((t, l) => t + l.N, 0)
      if (kindOf(p) === 'board' && carried > 0) posts.push(checkPost(p, s, mat, own + carried))
      continue
    }
    if (onFloor) continue
    if (!supports.length) {
      floating.push(p.id)
      continue
    }
    // Spread loads go to the supports in proportion; point loads to the nearest support
    passDown(own, 'dead')
    if (liveSpread) passDown(liveSpread, 'live')
    got.dead.forEach((l) => passDown(l.N, 'dead', l.pos))
    got.live.forEach((l) => passDown(l.N, 'live', l.pos))

    // ---- bending check
    const L = b.max[axis] - b.min[axis]
    const across: Axis = axis === 0 ? 2 : 0
    const width = s[across]
    const h = s[1]
    const I = (width * h ** 3) / 12
    const W = (width * h * h) / 6
    const EI = mat.E * I
    const fd = mat.fm * STRENGTH_SHARE
    const wDead = own / L
    const wLive = liveSpread / L
    const toLoads = (ls: { pos: [number, number, number]; N: number }[]) => ls.map((l) => ({ at: l.pos[axis] - b.min[axis], P: l.N }))
    const deadPts = toLoads(got.dead)
    const livePts = toLoads(got.live)
    const creepDead = 1 + mat.kdef
    const creepLive = 1 + (preset.longTerm ? mat.kdef : 0)

    const { inner, overhangs } = spans(merge(supports), L)
    let worst: BeamResult | null = null
    const consider = (r: Omit<BeamResult, 'partId' | 'name' | 'status' | 'loadKg'>) => {
      const status: Status =
        r.utilisation <= 0.7 && r.sag <= r.sagLimit ? 'ok' : r.utilisation <= 1 && r.sag <= r.sagLimit * 1.5 ? 'warn' : 'bad'
      const full: BeamResult = { ...r, partId: p.id, name: p.name, status, loadKg: 0 }
      const rank = (x: BeamResult) => Math.max(x.utilisation, x.sag / x.sagLimit)
      if (!worst || rank(full) > rank(worst)) worst = full
    }
    for (const sp of inner) {
      const len = sp.to - sp.from
      if (len < 1) continue
      const shift = (ls: Load[]) => ls.map((l) => ({ at: l.at - sp.from, P: l.P }))
      const dead = simpleSpan(len, wDead, shift(deadPts), EI)
      const live = simpleSpan(len, wLive, shift(livePts), EI)
      // A person (or heavy thing) in the middle, instead of the spread load
      const person = personKg ? simpleSpan(len, 0, [{ at: len / 2, P: personKg * G }], EI) : { M: 0, d: 0 }
      const liveM = Math.max(live.M, person.M)
      const liveD = Math.max(live.d * creepLive, person.d)
      const sag = dead.d * creepDead + liveD
      const limit = len / 300
      const capStress = ((W * fd - dead.M - liveM) * 4) / len
      const capSag = ((limit * 1.5 - sag) * 48 * EI) / len ** 3
      consider({
        span: len,
        cantilever: false,
        sag,
        sagLimit: limit,
        utilisation: (dead.M + liveM) / (W * fd),
        capacityKg: Math.max(0, Math.min(capStress, capSag) / G),
        capacityBy: capSag < capStress ? 'sag' : 'strength',
      })
    }
    for (const oh of overhangs) {
      const len = oh.length
      if (len < 30) continue
      const fromSupport = (ls: Load[]) =>
        ls.map((l) => ({ at: oh.side === 'start' ? oh.support - l.at : l.at - oh.support, P: l.P }))
      const dead = cantilever(len, wDead, fromSupport(deadPts), EI)
      const live = cantilever(len, wLive, fromSupport(livePts), EI)
      const person = personKg ? cantilever(len, 0, [{ at: len, P: personKg * G }], EI) : { M: 0, d: 0 }
      const liveM = Math.max(live.M, person.M)
      const liveD = Math.max(live.d * creepLive, person.d)
      const sag = dead.d * creepDead + liveD
      const limit = len / 150
      const capStress = (W * fd - dead.M - liveM) / len
      const capSag = ((limit * 1.5 - sag) * 3 * EI) / len ** 3
      consider({
        span: len,
        cantilever: true,
        sag,
        sagLimit: limit,
        utilisation: (dead.M + liveM) / (W * fd),
        capacityKg: Math.max(0, Math.min(capStress, capSag) / G),
        capacityBy: capSag < capStress ? 'sag' : 'strength',
      })
    }
    if (worst) {
      const r = worst as BeamResult
      r.loadKg = (liveSpread + got.live.reduce((sum, l) => sum + l.N, 0)) / G
      beams.push(r)
    }
  }

  // ---- tipping: a sideways push at the top, against the footprint on the floor
  const floorParts = parts.filter((p) => boxes.get(p.id)!.min[1] <= 0.5)
  let tip: TipResult | null = null
  const height = Math.max(0, ...parts.map((p) => boxes.get(p.id)!.max[1]))
  if (floorParts.length && height > 0) {
    const fp = floorParts.map((p) => boxes.get(p.id)!)
    const lo = [0, 2].map((i) => Math.min(...fp.map((b) => b.min[i])))
    const hi = [0, 2].map((i) => Math.max(...fp.map((b) => b.max[i])))
    const sides: [string, number][] = [
      ['0-', centre[0] - lo[0]],
      ['0+', hi[0] - centre[0]],
      ['2-', centre[2] - lo[1]],
      ['2+', hi[1] - centre[2]],
    ]
    const [dir, dist] = sides.reduce((m, s) => (s[1] < m[1] ? s : m))
    const pushKg = dist <= 0 ? 0 : (weightKg * dist) / height
    const status: Status = pushKg < 5 ? 'bad' : pushKg < 15 ? 'warn' : 'ok'
    tip = { pushKg, direction: DIR_NAMES[dir], height, status }
  }

  // ---- wobble: frames need something stiff in each vertical plane
  let rack: RackResult | null = null
  const uprights = parts.filter((p) => {
    const s = size(boxes.get(p.id)!)
    return kindOf(p) === 'board' && s[1] >= Math.max(s[0], s[2])
  })
  if (height >= 300 && uprights.length >= 2) {
    const standingSheet = (thicknessAxis: 0 | 2) =>
      parts.some((p) => {
        if (kindOf(p) !== 'sheet') return false
        const s = size(boxes.get(p.id)!)
        const inPlane = thicknessAxis === 2 ? 0 : 2
        return s[thicknessAxis] <= Math.min(s[1], s[inPlane]) && s[1] >= height * 0.4 && s[inPlane] >= 250
      })
    const unbraced: string[] = []
    if (!standingSheet(2)) unbraced.push('vänster–höger')
    if (!standingSheet(0)) unbraced.push('framåt–bakåt')
    rack = { unbraced, status: unbraced.length ? 'warn' : 'ok' }
  }

  return { weightKg, centre, onFloor: floorParts.length > 0, beams, posts, floating, tip, rack }
}

// ---------------------------------------------------------------- posts

/** E_0,05 is about two thirds of the mean modulus for structural timber */
const E05_SHARE = 0.67

/**
 * A standing board under load N (newton): crushing (A·fc) and Euler buckling
 * about its weak axis, with both ends taken as hinged (buckling length = its
 * height — on the safe side for legs fixed to rails), combined with the
 * Rankine formula 1/N = 1/Nc + 1/Ncr.
 */
function checkPost(p: Part, s: number[], mat: Material, N: number): PostResult {
  const height = s[1]
  const [t, w] = [s[0], s[2]].sort((a, b) => a - b)
  const A = t * w
  const I = (w * t ** 3) / 12
  const Nc = A * mat.fc * STRENGTH_SHARE
  const Ncr = (Math.PI ** 2 * mat.E * E05_SHARE * I) / height ** 2 / 1.3
  const Nrd = 1 / (1 / Nc + 1 / Ncr)
  const utilisation = N / Nrd
  const status: Status = utilisation <= 0.7 ? 'ok' : utilisation <= 1 ? 'warn' : 'bad'
  return {
    partId: p.id,
    name: p.name,
    height,
    loadKg: N / G,
    capacityKg: Nrd / G,
    capacityBy: Ncr < Nc ? 'buckling' : 'crushing',
    utilisation,
    status,
  }
}

// ---------------------------------------------------------------- spans

/** Merge support intervals that touch or overlap */
function merge(cs: Contact[]): [number, number][] {
  const iv = cs.map((c) => [c.from, c.to] as [number, number]).sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const [f, t] of iv) {
    const last = out[out.length - 1]
    if (last && f <= last[1] + TOL) last[1] = Math.max(last[1], t)
    else out.push([f, t])
  }
  return out
}

/**
 * Free spans between supports (centre of a narrow support, edge of a wide
 * one) and the overhangs past the outermost supports.
 */
function spans(iv: [number, number][], L: number) {
  const point = (i: [number, number], side: 'left' | 'right') =>
    i[1] - i[0] <= 100 ? (i[0] + i[1]) / 2 : side === 'left' ? i[1] : i[0]
  const inner: { from: number; to: number }[] = []
  for (let k = 0; k + 1 < iv.length; k++) inner.push({ from: point(iv[k], 'left'), to: point(iv[k + 1], 'right') })
  const overhangs: { side: 'start' | 'end'; support: number; length: number }[] = []
  if (iv.length) {
    const first = iv[0][1] - iv[0][0] <= 100 ? (iv[0][0] + iv[0][1]) / 2 : iv[0][0]
    const lastIv = iv[iv.length - 1]
    const last = lastIv[1] - lastIv[0] <= 100 ? (lastIv[0] + lastIv[1]) / 2 : lastIv[1]
    if (first > 0) overhangs.push({ side: 'start', support: first, length: first })
    if (L - last > 0) overhangs.push({ side: 'end', support: last, length: L - last })
  }
  return { inner, overhangs }
}
