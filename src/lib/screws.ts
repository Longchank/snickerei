/**
 * Screw suggestions: every place two parts touch is a joint; for each, which
 * part the screw goes through and which it bites into, a screw size, how
 * many, and whether (and with which bit) to pre-drill. Plus the totals.
 *
 * Rules of thumb from general carpentry practice (not sourced, not a
 * Eurocode calculation) — the UI presents them as suggestions:
 * - it should bite ≈ 1.5 × the piece's thickness into the part behind
 *   (30–90 mm; into end grain 2 ×, 40–120 mm), so ≈ 2.5 × for ordinary
 *   boards — never poking out of the far side
 * - diameter grows with the piece screwed through (4.0 for thin boards …
 *   6.0 for 45 mm and long screws, 8.0 konstruktionsskruv above 160 mm)
 * - at least 2 per joint, more for wide contacts; sheets c/c ~200 mm,
 *   long overlaps c/c ~300 mm
 * - pre-drill near ends (closer than 10 × d), into MDF, and for 8 mm screws
 * - pilot bit ≈ the screw's core: about 0.6 × d in softwood, 0.75 × d in MDF
 * - pressure-treated wood → stainless A4 or C4-coated screws
 */
import { getProfile } from './catalog'
import { partBox, toAxisBox, type AxisBox } from './geometry'
import { worldAxisOf } from './place'
import type { Part, Vec3 } from './types'

type Axis = 0 | 1 | 2
const AXES: Axis[] = [0, 1, 2]
const TOL = 1
/** Touching faces must share at least this much, mm */
const MIN_CONTACT = 5

export type ScrewType = 'träskruv' | 'skivskruv' | 'konstruktionsskruv'

export interface Screw {
  type: ScrewType
  /** Diameter, mm */
  d: number
  /** Length, mm */
  length: number
  /** Stainless/C4 for pressure-treated wood */
  outdoor: boolean
}

export interface Joint {
  /** The part the screw goes through */
  through: Part
  /** The part it bites into */
  into: Part
  screw: Screw
  count: number
  /** The screw goes into the receiving part's end grain (holds worse) */
  endGrain: boolean
  /** Pilot hole: bit diameter and why, or null when not needed */
  predrill: { bit: number; reason: string } | null
  /** The screw is shorter than the rule of thumb (the receiving part is too thin) */
  short: boolean
  /** Where the screw heads go: on the outer face of the part screwed through */
  points: Vec3[]
  /** Which way the screws go in (unit vector along one axis) */
  dir: Vec3
  /** Another part covers the side the screws go in from (no room for the screwdriver): its name */
  blockedBy: string | null
}

/** Common screw sizes: diameter → lengths */
const SIZES: [ScrewType, number, number[]][] = [
  ['träskruv', 4.0, [30, 35, 40, 45, 50]],
  ['träskruv', 4.5, [50, 60, 70]],
  ['träskruv', 5.0, [50, 60, 70, 80, 90, 100]],
  ['träskruv', 6.0, [100, 120, 140, 160]],
  ['konstruktionsskruv', 8.0, [160, 200, 240, 280]],
]

const boxOf = (p: Part) => toAxisBox(partBox(p))
const size = (b: AxisBox, i: number) => b.max[i] - b.min[i]
const overlap = (a: AxisBox, b: AxisBox, i: number) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i])

/** Where two parts touch face to face: the face's normal axis and the shared rectangle */
function contact(a: AxisBox, b: AxisBox): { axis: Axis; box: AxisBox } | null {
  let axis: Axis | null = null
  for (const i of AXES) {
    const o = overlap(a, b, i)
    if (Math.abs(o) <= TOL) {
      if (axis !== null) return null // touching along an edge, not a face
      axis = i
    } else if (o < MIN_CONTACT) return null // apart, or only grazing
  }
  if (axis === null) return null // overlapping: a collision, not a joint
  const min = AXES.map((i) => Math.max(a.min[i], b.min[i])) as AxisBox['min']
  const max = AXES.map((i) => Math.min(a.max[i], b.max[i])) as AxisBox['max']
  return { axis, box: { min, max } }
}

/** The pilot-hole bit for a screw, mm (rounded to bits you can buy) */
export function pilotBit(d: number, mdf: boolean): number {
  const raw = d * (mdf ? 0.75 : 0.6)
  return Math.round(raw * 2) / 2
}

/** The screw for a piece `t` mm thick, `depth` mm available behind it */
export function chooseScrew(t: number, depth: number, endGrain: boolean, sheet: boolean, outdoor: boolean): { screw: Screw; short: boolean } {
  // What matters is how far it bites into the part behind: ≈ 1.5 × t (30–90 mm),
  // more into end grain (2 × t, 40–120 mm). So ≈ 2.5 × t for ordinary boards.
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  const bite = endGrain ? clamp(2 * t, 40, 120) : clamp(1.5 * t, 30, 90)
  const want = t + bite
  const max = t + depth - 5 // don't come out the other side
  const d = sheet ? (t <= 18 ? 4.0 : 4.5) : t <= 18 ? 4.0 : t <= 25 ? 4.5 : t <= 40 ? 5.0 : want <= 100 ? 5.0 : want <= 160 ? 6.0 : 8.0
  // The smallest common length that's long enough, among this diameter and up
  const all = SIZES.flatMap(([type, sd, ls]) => ls.map((l) => ({ type, d: sd, length: l })))
  const options = all.filter((o) => o.d >= d)
  const good = options.filter((o) => o.length <= max && o.length >= want).sort((x, y) => x.d - y.d || x.length - y.length)[0]
  // Too thin behind for the rule: the longest screw that still stays inside (thinner if need be)
  const fallback = all.filter((o) => o.length <= max).sort((x, y) => y.length - x.length || y.d - x.d)[0]
  const pick = good ?? fallback ?? all.sort((x, y) => x.length - y.length)[0]
  const type: ScrewType = sheet ? 'skivskruv' : pick.type
  return { screw: { type, d: pick.d, length: pick.length, outdoor }, short: !good }
}

/** How many screws for a contact rectangle whose longer side is u */
function screwCount(u: number, sheet: boolean): number {
  if (sheet) return Math.max(2, Math.ceil(u / 200) + 1)
  if (u > 250) return Math.max(2, Math.ceil(u / 300) + 1)
  // 2 up to a 95-wide board, then one more per ~50 mm
  return u <= 100 ? 2 : u <= 150 ? 3 : u <= 200 ? 4 : 5
}

/** n positions between lo and hi: evenly in short rows, ~40 mm in from the ends in long ones */
function spread(lo: number, hi: number, n: number): number[] {
  const len = hi - lo
  if (n === 1) return [lo + len / 2]
  if (len <= 250) return Array.from({ length: n }, (_, k) => lo + (len * (k + 0.5)) / n)
  const m = Math.min(40, len / (2 * n))
  return Array.from({ length: n }, (_, k) => lo + m + ((len - 2 * m) * k) / (n - 1))
}

/** Colours for the screw sizes, in the order of the totals table */
export const SCREW_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563']

/** Distance from a point along the part's length to its nearest end */
function distToEnd(p: Part, b: AxisBox, at: number[]): number {
  const L = worldAxisOf(p.rotation, 0)
  return Math.min(at[L] - b.min[L], b.max[L] - at[L])
}

/** All screwed joints in the build, one per pair of touching parts */
export function screwJoints(parts: Part[]): Joint[] {
  const boxes = new Map(parts.map((p) => [p.id, boxOf(p)]))
  const out: Joint[] = []
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i]
      const b = parts[j]
      if (a.rip && b.rip?.id === a.rip.id) continue // a French cleat's halves aren't screwed together
      const c = contact(boxes.get(a.id)!, boxes.get(b.id)!)
      if (!c) continue
      const n = c.axis
      // Screw through the part that's thinner along the screw, never along a board's length
      const alongLength = (p: Part) => getProfile(p.profileId).kind === 'board' && worldAxisOf(p.rotation, 0) === n
      const cand = [a, b].filter((p) => !alongLength(p))
      if (!cand.length) continue // two boards end to end: not a screwed joint
      const through = cand.sort((x, y) => size(boxes.get(x.id)!, n) - size(boxes.get(y.id)!, n))[0]
      const into = through === a ? b : a
      const tb = boxes.get(through.id)!
      const ib = boxes.get(into.id)!
      const t = size(tb, n)
      const depth = size(ib, n)
      const endGrain = alongLength(into)
      const throughProf = getProfile(through.profileId)
      const intoProf = getProfile(into.profileId)
      const sheet = throughProf.kind === 'sheet'
      const outdoor = throughProf.category === 'tryckimpregnerat' || intoProf.category === 'tryckimpregnerat'
      const { screw, short } = chooseScrew(t, depth, endGrain, sheet, outdoor)
      const u = Math.max(...AXES.filter((x) => x !== n).map((x) => size(c.box, x)))
      const count = screwCount(u, sheet)
      // Pre-drilling: near an end, into MDF, or for thick screws
      const centre = AXES.map((x) => (c.box.min[x] + c.box.max[x]) / 2)
      const nearEnd = [through, into].some((p) => getProfile(p.profileId).kind === 'board' && !alongLength(p) && distToEnd(p, boxes.get(p.id)!, centre) < 10 * screw.d)
      const mdf = intoProf.category === 'mdf' || throughProf.category === 'mdf'
      const reason = mdf ? 'MDF spricker lätt' : screw.d >= 8 ? 'grov skruv' : nearEnd ? 'nära änden — annars spricker det' : null
      // Screw heads on the through part's outer face, spread over the contact
      const throughBelow = Math.abs(tb.max[n] - c.box.min[n]) <= TOL
      const face = throughBelow ? tb.min[n] : tb.max[n]
      const dir = [0, 0, 0] as Vec3
      dir[n] = throughBelow ? 1 : -1
      const [ua, va] = AXES.filter((x) => x !== n).sort((x, y) => size(c.box, y) - size(c.box, x))
      const points = spread(c.box.min[ua], c.box.max[ua], count).map((pos) => {
        const p = [0, 0, 0] as Vec3
        p[n] = face
        p[ua] = pos
        p[va] = (c.box.min[va] + c.box.max[va]) / 2
        return p
      })
      // Is the side the screws go in from covered by another part?
      const covering = parts.find((q) => {
        if (q.id === through.id || q.id === into.id) return false
        const qb = boxes.get(q.id)!
        return points.some((p) => AXES.every((x) => {
          const v = x === n ? p[x] - dir[x] * 2 : p[x]
          return v > qb.min[x] + 0.1 && v < qb.max[x] - 0.1
        }))
      })
      out.push({
        through,
        into,
        points,
        dir,
        blockedBy: covering ? covering.name : null,
        screw,
        count,
        endGrain,
        predrill: reason ? { bit: pilotBit(screw.d, mdf), reason } : null,
        short,
      })
    }
  return out
}

/** "5,0 × 90 träskruv (rostfri/C4)" */
export function screwName(s: Screw): string {
  const d = s.d.toFixed(1).replace('.', ',')
  return `${d} × ${s.length} ${s.type}${s.outdoor ? ' (rostfri A4/C4)' : ''}`
}

export interface ScrewTotal {
  screw: Screw
  count: number
  /** With about 10 % spare, rounded up to whole tens */
  toBuy: number
  /** Pilot bits used with this screw, mm */
  bits: number[]
}

/** Screws needed, per size and type */
export function screwTotals(joints: Joint[]): ScrewTotal[] {
  const map = new Map<string, ScrewTotal>()
  for (const j of joints) {
    const key = screwName(j.screw)
    const t = map.get(key) ?? { screw: j.screw, count: 0, toBuy: 0, bits: [] }
    t.count += j.count
    if (j.predrill && !t.bits.includes(j.predrill.bit)) t.bits.push(j.predrill.bit)
    map.set(key, t)
  }
  for (const t of map.values()) t.toBuy = Math.ceil((t.count * 1.1) / 10) * 10
  return [...map.values()].sort((a, b) => a.screw.d - b.screw.d || a.screw.length - b.screw.length)
}

export interface ScrewSection {
  /** "Ram", "Montering: Ram + Ben", "Lösa delar" … */
  title: string
  /** The build step it belongs to: the group's id, or 'montering' for joining groups and loose parts */
  step: string
  /** Joints inside one group, or joining groups (and loose parts) together */
  kind: 'group' | 'assembly' | 'loose'
  joints: Joint[]
}

/**
 * The joints in build order: first each group on its own (a frame, a set
 * of legs), then where groups (and loose parts) are joined together, then
 * joints between loose parts.
 */
export function screwSections(joints: Joint[], groups: { id: string; name: string }[]): ScrewSection[] {
  const nameOf = new Map(groups.map((g) => [g.id, g.name]))
  const label = (p: Part) => (p.groupId ? nameOf.get(p.groupId) ?? 'Grupp' : 'lösa delar')
  const byKey = new Map<string, ScrewSection>()
  const add = (key: string, make: () => ScrewSection, j: Joint) => {
    if (!byKey.has(key)) byKey.set(key, make())
    byKey.get(key)!.joints.push(j)
  }
  for (const j of joints) {
    const a = j.through.groupId
    const b = j.into.groupId
    if (a && a === b) add(`g:${a}`, () => ({ title: nameOf.get(a) ?? 'Grupp', step: a, kind: 'group', joints: [] }), j)
    else if (!a && !b) add('loose', () => ({ title: 'Lösa delar', step: 'montering', kind: 'loose', joints: [] }), j)
    else {
      const names = [label(j.through), label(j.into)].sort()
      add(`m:${names.join('|')}`, () => ({ title: `Montering: ${names[0]} + ${names[1]}`, step: 'montering', kind: 'assembly', joints: [] }), j)
    }
  }
  const order = { group: 0, assembly: 1, loose: 2 }
  return [...byKey.values()].sort((x, y) => order[x.kind] - order[y.kind])
}
