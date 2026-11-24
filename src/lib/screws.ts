/**
 * Screw suggestions: every place two parts touch is a joint; for each, which
 * part the screw goes through and which it bites into, a screw size, how
 * many, and whether (and with which bit) to pre-drill. Plus the totals.
 *
 * Rules of thumb, not a Eurocode calculation — the UI presents them as
 * suggestions. Length from Svenskt Trä's skruv- och spikguide
 * (byggbeskrivningar.se, "dubbla längden av det man ska skruva fast",
 * checked 2026-11-22 against its table of minimum lengths); the rest is
 * general carpentry practice, not sourced:
 * - length ≈ 2 × the piece's thickness, at least 30 mm, so it bites ≈ 1 ×
 *   the thickness into the part behind (at most 90 mm); into end grain
 *   more (2 × t, 40–120 mm — our own assumption) — never poking out of the
 *   far side
 * - diameter grows with the piece screwed through (4.0 for thin boards …
 *   6.0 for 45 mm and long screws, 8.0 konstruktionsskruv above 160 mm)
 * - at least 2 per joint, more for wide contacts; sheets and long overlaps
 *   c/c ~300 mm (owner 2026-11-22: c/c 200 put too many in plywood)
 * - two screws sit diagonally, short rows zigzag across the contact, so a
 *   joint isn't split along one line of grain and you know which diagonal
 *   to use when screwing groups together
 * - pre-drilling is advice ("Råd"): near ends (closer than 10 × d), into
 *   MDF, and for 8 mm screws
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
  /** Thickness screwed through and of the part behind, along the screw */
  t: number
  depth: number
  /** Screws placed by hand (Ny fog, or moved one by one) rather than spread out */
  placed: boolean
  flip: boolean
  /** The screws can go in from the other side too (not when the part behind is end grain) */
  canReverse: boolean
  /** Where the screw heads go: on the outer face of the part screwed through */
  points: Vec3[]
  /** The rule-of-thumb count; `count` differs when set by hand (0 when switched off) */
  suggested: number
  /** Id of the joint for hand edits: "through|into" */
  key: string
  /** Switched off by hand: no screws (count 0) */
  off: boolean
  /** Added by hand */
  manual: boolean
  /** Count, size, positions or on/off changed by hand */
  custom: boolean
  /** The contact the screws sit on: where they may be moved (normal axis, then the two in-plane axes) */
  area: AxisBox
  axes: [Axis, Axis]
  /** The through part's box corner: hand-placed points are stored relative to it */
  origin: Vec3
  /** Which way the screws go in (unit vector along one axis) */
  dir: Vec3
  /** Another part covers the side the screws go in from (no room for the screwdriver): its name */
  blockedBy: string | null
}

/** Common screw sizes: diameter → lengths */
const SIZES: [ScrewType, number, number[]][] = [
  ['träskruv', 4.0, [30, 35, 40, 45, 50]],
  ['träskruv', 4.5, [40, 45, 50, 60, 70, 80]],
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
/**
 * How far a screw should reach into the part behind (mm). Svenskt Trä: the
 * screw twice as long as what's fastened, so the bite ≈ its thickness —
 * with the screw at least 30 mm and the bite at most 90. End grain holds
 * worse, so more there (2 × t, 40–120; our own assumption).
 */
/** A bite under this share of the wanted one counts as a short screw */
export const SHORT_FRACTION = 0.75

export function wantBite(t: number, endGrain: boolean): number {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  return endGrain ? clamp(2 * t, 40, 120) : clamp(Math.max(t, 30 - t), 0, 90)
}

export function chooseScrew(t: number, depth: number, endGrain: boolean, sheet: boolean, outdoor: boolean): { screw: Screw; short: boolean } {
  const bite = wantBite(t, endGrain)
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
  // Svenskt Trä's minimum lengths are ≈ 1.8 × t (45 → 80), so a screw is only
  // "short" when it bites less than about 3/4 of the wanted depth
  return { screw: { type, d: pick.d, length: pick.length, outdoor }, short: !good && pick.length - t < SHORT_FRACTION * bite }
}

/** How many screws for a contact rectangle whose longer side is u */
function screwCount(u: number, sheet: boolean): number {
  if (sheet) return Math.max(2, Math.ceil(u / 300) + 1)
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

/** Key for a joint's hand-set screw count */
export const jointKey = (through: Part, into: Part) => `${through.id}|${into.id}`

/** Distance from a point along the part's length to its nearest end */
function distToEnd(p: Part, b: AxisBox, at: number[]): number {
  const L = worldAxisOf(p.rotation, 0)
  return Math.min(at[L] - b.min[L], b.max[L] - at[L])
}

/** Hand edits to one joint (key "throughId|intoId"): count, size, switched off, or added by hand */
export interface ScrewEdit {
  count?: number
  /** A chosen size instead of the suggested one */
  d?: number
  length?: number
  /** No screws in this joint (glued, or not wanted) */
  off?: boolean
  /** Added by hand between two parts the app didn't pair up */
  manual?: boolean
  /** Screws placed one by one in 3D: offsets from the through part's box corner (min x, y, z) */
  points?: Vec3[]
  /** The other diagonal (zigzag starts on the other side) */
  flip?: boolean
  /** A suggested joint taken into the build ("✦ Fyll i rekommenderade") */
  on?: boolean
}

/** A sheet's edge: never screwed into or through (owner 2026-11-23: too brittle) */
export function isSheetEdge(p: Part, axis: number): boolean {
  return getProfile(p.profileId).kind === 'sheet' && worldAxisOf(p.rotation, 1) !== axis
}

/** Screw sizes on offer, for a size picker: of the same type as `s` (wood/sheet screws share sizes) */
export function sizeOptions(s: Screw): { d: number; length: number }[] {
  return SIZES.filter(([type]) => (s.type === 'konstruktionsskruv' ? type === 'konstruktionsskruv' : type !== 'konstruktionsskruv') || s.type === 'skivskruv')
    .flatMap(([, d, ls]) => ls.map((length) => ({ d, length })))
}

/**
 * One joint: `through` is screwed into `into` across the contact rectangle
 * `c` (its normal axis and box), with the hand edits applied.
 */
function buildJoint(
  parts: Part[],
  boxes: Map<string, AxisBox>,
  through: Part,
  into: Part,
  c: { axis: Axis; box: AxisBox },
  edit: ScrewEdit | undefined,
): Joint {
  const n = c.axis
  const alongLength = (p: Part) => getProfile(p.profileId).kind === 'board' && worldAxisOf(p.rotation, 0) === n
  const tb = boxes.get(through.id)!
  const ib = boxes.get(into.id)!
  const t = size(tb, n)
  const depth = size(ib, n)
  const endGrain = alongLength(into)
  const throughProf = getProfile(through.profileId)
  const intoProf = getProfile(into.profileId)
  const sheet = throughProf.kind === 'sheet'
  const outdoor = throughProf.category === 'tryckimpregnerat' || intoProf.category === 'tryckimpregnerat'
  const auto = chooseScrew(t, depth, endGrain, sheet, outdoor)
  // A size chosen by hand replaces the suggestion (type follows the diameter)
  const chosen = edit?.d && edit.length
  const screw: Screw = chosen
    ? { ...auto.screw, d: edit!.d!, length: edit!.length!, type: sheet ? 'skivskruv' : edit!.d! >= 8 ? 'konstruktionsskruv' : 'träskruv' }
    : auto.screw
  const short = chosen ? screw.length - t < SHORT_FRACTION * wantBite(t, endGrain) : auto.short
  const u = Math.max(...AXES.filter((x) => x !== n).map((x) => size(c.box, x)))
  const key = jointKey(through, into)
  const suggested = screwCount(u, sheet)
  const off = !!edit?.off
  const placed = !off && edit?.points?.length ? edit.points : null
  const count = off ? 0 : placed ? placed.length : edit?.count ?? suggested
  // Pre-drilling: near an end, into MDF, or for thick screws
  const centre = AXES.map((x) => (c.box.min[x] + c.box.max[x]) / 2)
  const nearEnd = [through, into].some((p) => getProfile(p.profileId).kind === 'board' && !alongLength(p) && distToEnd(p, boxes.get(p.id)!, centre) < 10 * screw.d)
  const mdf = intoProf.category === 'mdf' || throughProf.category === 'mdf'
  const reason = mdf ? 'MDF spricker lätt' : screw.d >= 8 ? 'grov skruv' : nearEnd ? 'nära änden — annars spricker det' : null
  // Screw heads on the through part's outer face, spread over the contact
  const throughBelow = (tb.min[n] + tb.max[n]) / 2 < (ib.min[n] + ib.max[n]) / 2
  const face = throughBelow ? tb.min[n] : tb.max[n]
  const dir = [0, 0, 0] as Vec3
  dir[n] = throughBelow ? 1 : -1
  const [ua, va] = AXES.filter((x) => x !== n).sort((x, y) => size(c.box, y) - size(c.box, x))
  // Short rows zigzag across the contact (two screws = a diagonal) when it's wide enough
  const across = size(c.box, va)
  const zigzag = count >= 2 && across >= 30 && size(c.box, ua) <= 250
  const clampTo = (v: number, i: number) => Math.min(c.box.max[i], Math.max(c.box.min[i], v))
  const points = placed
    ? // Placed by hand: follow the through part, stay on the contact
      placed.map((o) => {
        const p = AXES.map((i) => tb.min[i] + o[i]) as Vec3
        p[n] = face
        p[ua] = clampTo(p[ua], ua)
        p[va] = clampTo(p[va], va)
        return p
      })
    : spread(c.box.min[ua], c.box.max[ua], count).map((pos, k) => {
        const p = [0, 0, 0] as Vec3
        p[n] = face
        p[ua] = pos
        p[va] = zigzag ? c.box.min[va] + across * ((k % 2 === 0) !== !!edit?.flip ? 0.25 : 0.75) : (c.box.min[va] + c.box.max[va]) / 2
        return p
      })
  // Is the side the screws go in from covered by another part — one that's
  // already there when this joint is screwed? Build order (screwSections):
  // each group on its own, then the groups joined together, then loose
  // parts. So inside a group only that group's parts count; joining
  // groups, every grouped part; a joint with a loose part, everything.
  const g1 = through.groupId
  const g2 = into.groupId
  const present = (q: Part) => (g1 && g2 ? (g1 === g2 ? q.groupId === g1 : !!q.groupId) : true)
  const covering = parts.find((q) => {
    if (q.id === through.id || q.id === into.id || !present(q)) return false
    const qb = boxes.get(q.id)!
    return points.some((p) => AXES.every((x) => {
      const v = x === n ? p[x] - dir[x] * 2 : p[x]
      return v > qb.min[x] + 0.1 && v < qb.max[x] - 0.1
    }))
  })
  return {
    through,
    into,
    points: count ? points : [],
    dir,
    blockedBy: count && covering ? covering.name : null,
    screw,
    count,
    suggested,
    key,
    off,
    manual: !!edit?.manual,
    custom: !!edit && !edit.manual && (edit.count !== undefined || !!chosen || off || !!placed || !!edit.flip),
    area: c.box,
    axes: [ua, va],
    origin: [...tb.min] as Vec3,
    endGrain,
    predrill: reason ? { bit: pilotBit(screw.d, mdf), reason } : null,
    short,
    t,
    depth,
    placed: !!placed,
    flip: !!edit?.flip,
    canReverse: !endGrain,
  }
}

/**
 * Where to screw two parts the app didn't pair up: across the axis they're
 * furthest apart on (or the through part's thinnest, if they overlap), over
 * the area they share — or the through part's own face if they share none.
 */
function manualContact(tb: AxisBox, ib: AxisBox): { axis: Axis; box: AxisBox } {
  const gap = (i: Axis) => Math.max(tb.min[i], ib.min[i]) - Math.min(tb.max[i], ib.max[i])
  const separated = AXES.filter((i) => gap(i) >= -TOL)
  const axis = separated.length
    ? separated.sort((x, y) => gap(y) - gap(x))[0]
    : AXES.slice().sort((x, y) => size(tb, x) - size(tb, y))[0]
  const min = [...tb.min] as AxisBox['min']
  const max = [...tb.max] as AxisBox['max']
  for (const i of AXES) {
    if (i === axis) continue
    const lo = Math.max(tb.min[i], ib.min[i])
    const hi = Math.min(tb.max[i], ib.max[i])
    if (hi - lo > MIN_CONTACT) {
      min[i] = lo
      max[i] = hi
    }
  }
  return { axis, box: { min, max } }
}

/**
 * The screwed joints in the build. Since 2026-11-23 a project starts with
 * none (owner: "start with no joints, create them with Ny fog"): a joint the
 * app finds between two touching parts is only in the build once it has an
 * edit (taken in with "✦ Fyll i rekommenderade", or changed by hand), plus
 * those added by hand. `all` = every suggestion too (the old behaviour).
 */
export function screwJoints(parts: Part[], edits: Record<string, ScrewEdit> = {}, opts: { all?: boolean } = {}): Joint[] {
  const boxes = new Map(parts.map((p) => [p.id, boxOf(p)]))
  const out: Joint[] = []
  // Outer boxes: of each group (its own joints are screwed before assembly) and of the whole build
  const unionOf = (ps: Part[]): AxisBox | null =>
    ps.length
      ? ps.map((p) => boxes.get(p.id)!).reduce((u, b) => ({
          min: u.min.map((v, i) => Math.min(v, b.min[i])) as Vec3,
          max: u.max.map((v, i) => Math.max(v, b.max[i])) as Vec3,
        }))
      : null
  const whole = unionOf(parts)
  const groupBox = new Map<string, AxisBox>()
  for (const id of new Set(parts.map((p) => p.groupId).filter(Boolean) as string[])) groupBox.set(id, unionOf(parts.filter((p) => p.groupId === id))!)
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
      // Never into or through a sheet's edge
      if (isSheetEdge(a, n) || isSheetEdge(b, n)) continue
      // A joint already in the build keeps the direction it was given (its key); a new one is
      // screwed from the outside in (owner 2026-11-24: easier to reach) — the part whose free
      // side is on the outside of its group (own joints) or of the build (assembly);
      // otherwise (both or neither outside) the thinner part
      const keyed = cand.find((t) => edits[jointKey(t, t === a ? b : a)])
      const outer = (a.groupId && a.groupId === b.groupId ? groupBox.get(a.groupId) : whole)!
      const ab = boxes.get(a.id)!
      const bb = boxes.get(b.id)!
      const aBelow = (ab.min[n] + ab.max[n]) / 2 < (bb.min[n] + bb.max[n]) / 2
      const toOutside = (p: Part) => (p === a) === aBelow ? boxes.get(p.id)!.min[n] - outer.min[n] : outer.max[n] - boxes.get(p.id)!.max[n]
      const through =
        keyed ??
        cand.sort((x, y) => Number(toOutside(x) > 1) - Number(toOutside(y) > 1) || size(boxes.get(x.id)!, n) - size(boxes.get(y.id)!, n))[0]
      const into = through === a ? b : a
      const edit = edits[jointKey(through, into)]
      if (!opts.all && !edit) continue // a suggestion, not taken in
      out.push(buildJoint(parts, boxes, through, into, c, edit))
    }
  // Joints added by hand (ones the app already found are just edits of those)
  const found = new Set(out.map((j) => j.key))
  const byId = new Map(parts.map((p) => [p.id, p]))
  for (const [key, edit] of Object.entries(edits)) {
    if (!edit.manual || found.has(key)) continue
    const [tid, iid] = key.split('|')
    const through = byId.get(tid)
    const into = byId.get(iid)
    if (!through || !into) continue // a part was removed
    const c = contact(boxes.get(tid)!, boxes.get(iid)!) ?? manualContact(boxes.get(tid)!, boxes.get(iid)!)
    out.push(buildJoint(parts, boxes, through, into, c, edit))
  }
  return out
}

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
    if (!j.count) continue
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
/** The build step a joint is screwed in: its group's, or 'montering' (between groups, or with loose parts) */
export function jointStep(j: Joint): string {
  const a = j.through.groupId
  return a && a === j.into.groupId ? a : 'montering'
}

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

/** Where the screws cluster on the face: at the tap (default), or at its start / centre / end */
export type JointAnchor = 'tap' | 'start' | 'center' | 'end'

/** A joint being placed by hand ("Ny fog"): where the screws go and how far they reach */
export interface JointPlan {
  through: Part
  into: Part
  key: string
  anchor: JointAnchor
  points: Vec3[]
  /** Screwing direction (into the part) */
  dir: Vec3
  screw: Screw
  /** Thickness screwed through, and how much of the part behind is there */
  t: number
  depth: number
  /** How far the screw reaches into the part behind (length − t) */
  bite: number
  /** The rule of thumb for that bite */
  wantBite: number
  /** It would come out the far side */
  poke: boolean
  /** Through or into a sheet's edge: not allowed (too brittle) */
  sheetEdge: boolean
}

/**
 * "Ny fog": a tap on a face of `through` at `hit` (outward `normal`) — the
 * screws go in there, through that part and into the part right behind it.
 * `count` screws cluster around the tap (kept 40 mm in from the face's
 * ends), zigzagging across (flip = the other diagonal). Null when nothing is behind the tapped face.
 */
export function planJoint(
  parts: Part[],
  throughId: string,
  hit: Vec3,
  normal: Vec3,
  opts: { anchor?: JointAnchor; count?: number; flip?: boolean; d?: number; length?: number } = {},
): JointPlan | null {
  const through = parts.find((p) => p.id === throughId)
  if (!through) return null
  const n = AXES.reduce((m, i) => (Math.abs(normal[i]) > Math.abs(normal[m]) ? i : m), 0 as Axis)
  const s = normal[n] >= 0 ? 1 : -1
  const tb = boxOf(through)
  const t = size(tb, n)
  const face = s > 0 ? tb.max[n] : tb.min[n]
  // The part right behind: just past the far side of the one screwed through
  const probe = [...hit] as Vec3
  probe[n] = face - s * (t + 1)
  const into = parts.find((q) => {
    if (q.id === through.id) return false
    const b = boxOf(q)
    return AXES.every((i) => probe[i] >= b.min[i] - 0.5 && probe[i] <= b.max[i] + 0.5)
  })
  if (!into) return null
  const ib = boxOf(into)
  const depth = s > 0 ? Math.max(0, face - t - ib.min[n]) : Math.max(0, ib.max[n] - (face + t))
  // The area both parts share on the face (else the through part's face)
  const [p1, p2] = AXES.filter((i) => i !== n)
  const span = (i: Axis): [number, number] => {
    const lo = Math.max(tb.min[i], ib.min[i])
    const hi = Math.min(tb.max[i], ib.max[i])
    return hi - lo > 1 ? [lo, hi] : [tb.min[i], tb.max[i]]
  }
  const [ua, va] = span(p1)[1] - span(p1)[0] >= span(p2)[1] - span(p2)[0] ? [p1, p2] : [p2, p1]
  const [ulo, uhi] = span(ua)
  const [vlo, vhi] = span(va)
  const len = uhi - ulo
  const anchor: JointAnchor = opts.anchor ?? 'tap'
  const count = Math.max(1, Math.min(10, opts.count ?? 2))
  const margin = Math.min(40, len * 0.2)
  const step = count > 1 ? Math.min(60, (len - 2 * margin) / (count - 1)) : 0
  // Centred on the tap, but kept inside the face (40 mm from its ends)
  const half = ((count - 1) * step) / 2
  const lo = ulo + margin + half
  const hi = uhi - margin - half
  const atTap = lo <= hi ? Math.min(hi, Math.max(lo, hit[ua])) : (ulo + uhi) / 2
  const along = Array.from({ length: count }, (_, k) =>
    anchor === 'start'
      ? ulo + margin + k * step
      : anchor === 'end'
        ? uhi - margin - k * step
        : (anchor === 'center' ? (ulo + uhi) / 2 : atTap) + (k - (count - 1) / 2) * step,
  )
  const across = vhi - vlo
  const zigzag = count >= 2 && across >= 30
  const points = along.map((u, k) => {
    const p = [0, 0, 0] as Vec3
    p[n] = face
    p[ua] = Math.round(u * 10) / 10
    const side = (k % 2 === 0) !== !!opts.flip ? 0.25 : 0.75
    p[va] = Math.round((zigzag ? vlo + across * side : (vlo + vhi) / 2) * 10) / 10
    return p
  })
  const dir = [0, 0, 0] as Vec3
  dir[n] = -s
  const throughProf = getProfile(through.profileId)
  const intoProf = getProfile(into.profileId)
  const endGrain = intoProf.kind === 'board' && worldAxisOf(into.rotation, 0) === n
  const sheet = throughProf.kind === 'sheet'
  const outdoor = throughProf.category === 'tryckimpregnerat' || intoProf.category === 'tryckimpregnerat'
  const auto = chooseScrew(t, depth, endGrain, sheet, outdoor).screw
  const screw: Screw =
    opts.d && opts.length
      ? { ...auto, d: opts.d, length: opts.length, type: sheet ? 'skivskruv' : opts.d >= 8 ? 'konstruktionsskruv' : 'träskruv' }
      : auto
  const bite = screw.length - t
  return {
    through,
    into,
    key: jointKey(through, into),
    anchor,
    points,
    dir,
    screw,
    t,
    depth,
    bite,
    wantBite: wantBite(t, endGrain),
    poke: bite > depth,
    sheetEdge: isSheetEdge(through, n) || isSheetEdge(into, n),
  }
}

/** A joint's screw spots as offsets from the through part's box corner (how ScrewEdit stores them) */
export function pointOffsets(j: Joint, points: Vec3[] = j.points): Vec3[] {
  return points.map((p) => p.map((v, i) => Math.round((v - j.origin[i]) * 10) / 10) as Vec3)
}

/** The other diagonal: hand-placed screws are mirrored across the contact, spread ones flip the zigzag */
export function flipJointEdit(j: Joint): Partial<ScrewEdit> {
  if (!j.placed) return { flip: !j.flip || undefined }
  const [, va] = j.axes
  const mirrored = j.points.map((p) => {
    const q = [...p] as Vec3
    q[va] = j.area.min[va] + j.area.max[va] - p[va]
    return q
  })
  return { points: pointOffsets(j, mirrored) }
}

/**
 * A new screw count for a joint. Spread screws are just re-spread; hand-placed
 * ones keep their spots — one more goes 30 mm on from the last (back if
 * there's no room), one fewer drops the last.
 */
export function countJointEdit(j: Joint, n: number): Partial<ScrewEdit> {
  const want = Math.max(1, Math.min(20, n))
  if (!j.placed) return { count: want, points: undefined }
  const [ua] = j.axes
  const pts = [...j.points]
  while (pts.length > want) pts.pop()
  while (pts.length < want) {
    const last = pts[pts.length - 1]
    const p = [...last] as Vec3
    const room = j.area.max[ua] - last[ua]
    p[ua] = Math.min(j.area.max[ua], Math.max(j.area.min[ua], last[ua] + (room > 30 ? 30 : -30)))
    pts.push(p)
  }
  return { points: pointOffsets(j, pts), count: undefined }
}

/** Suggested joints not yet in the build ("✦ Fyll i rekommenderade") */
export function suggestedJoints(parts: Part[], edits: Record<string, ScrewEdit> = {}): Joint[] {
  return screwJoints(parts, edits, { all: true }).filter((j) => !edits[j.key])
}

/** Back to the suggestion, keeping the joint in the build */
export const RESET: Partial<ScrewEdit> = { count: undefined, d: undefined, length: undefined, points: undefined, flip: undefined, off: undefined }

/* ---- Planning the whole build's screws (owner 2026-11-24: "not every pair
   of touching pieces, but the best places so everything holds — today
   screws often land in each other at assembly") ---- */

/** A screw as a line in space: head → tip */
export interface ScrewLine {
  key: string
  a: Vec3
  b: Vec3
  d: number
}

export function screwLines(j: Joint, points: Vec3[] = j.points): ScrewLine[] {
  return points.map((p) => ({ key: j.key, a: p, b: p.map((v, i) => v + j.dir[i] * j.screw.length) as Vec3, d: j.screw.d }))
}

/** Shortest distance between two line segments */
export function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const sub = (a: Vec3, b: Vec3) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]] as Vec3
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const d1 = sub(q1, p1)
  const d2 = sub(q2, p2)
  const r = sub(p1, p2)
  const a = dot(d1, d1)
  const e = dot(d2, d2)
  const f = dot(d2, r)
  let s = 0
  let t = 0
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  if (a < 1e-9 && e < 1e-9) return Math.sqrt(dot(r, r))
  if (a < 1e-9) t = clamp(f / e)
  else {
    const c = dot(d1, r)
    if (e < 1e-9) s = clamp(-c / a)
    else {
      const b = dot(d1, d2)
      const denom = a * e - b * b
      s = denom > 1e-9 ? clamp((b * f - c * e) / denom) : 0
      t = (b * s + f) / e
      if (t < 0) {
        t = 0
        s = clamp(-c / a)
      } else if (t > 1) {
        t = 1
        s = clamp((b - c) / a)
      }
    }
  }
  const c1 = p1.map((v, i) => v + d1[i] * s) as Vec3
  const c2 = p2.map((v, i) => v + d2[i] * t) as Vec3
  const g = sub(c1, c2)
  return Math.sqrt(dot(g, g))
}

/** Two screws too close: they'd hit each other or split the wood between them */
export function linesClash(x: ScrewLine, y: ScrewLine): boolean {
  return segmentDistance(x.a, x.b, y.a, y.b) < (x.d + y.d) / 2 + 6
}

/** Pairs of joints whose screws run into each other */
export function screwClashes(joints: Joint[]): { a: Joint; b: Joint; at: Vec3 }[] {
  const lines = joints.flatMap((j) => screwLines(j).map((l) => ({ l, j })))
  const out: { a: Joint; b: Joint; at: Vec3 }[] = []
  const seen = new Set<string>()
  for (let i = 0; i < lines.length; i++)
    for (let k = i + 1; k < lines.length; k++) {
      const x = lines[i]
      const y = lines[k]
      if (x.j.key === y.j.key || !linesClash(x.l, y.l)) continue
      const pair = [x.j.key, y.j.key].sort().join(' ')
      if (seen.has(pair)) continue
      seen.add(pair)
      out.push({ a: x.j, b: y.j, at: x.l.a })
    }
  return out
}

/**
 * "✦ Fyll i rekommenderade": the suggested joints to take in, planned as a
 * whole. Joints go in build order (each group's own, in group order, then
 * the assembly); a screw that would run into one already placed moves to
 * the nearest free spot on its contact (10 mm steps, kept 15 mm from the
 * contact's edges), or is left out. A joint into end grain is left out when
 * the part screwed through is already held on its side grain and the part
 * behind has other joints (e.g. a top screwed down into the legs' ends when
 * it already sits on the rails).
 * Returns the edits to add; joints already in the build are obstacles.
 */
export function planScrews(
  parts: Part[],
  edits: Record<string, ScrewEdit> = {},
  groupOrder: string[] = [],
  only?: Set<string>,
): Record<string, ScrewEdit> {
  const all = screwJoints(parts, edits, { all: true })
  const taken = all.filter((j) => edits[j.key])
  const lines: ScrewLine[] = taken.flatMap((j) => screwLines(j))
  const rank = (j: Joint) => {
    const s = jointStep(j)
    const g = groupOrder.indexOf(s)
    return s === 'montering' ? groupOrder.length : g < 0 ? groupOrder.length - 0.5 : g
  }
  const cands = all
    .filter((j) => !edits[j.key] && j.count > 0 && (!only || only.has(j.through.id) || only.has(j.into.id)))
    .sort((x, y) => rank(x) - rank(y) || Number(x.endGrain) - Number(y.endGrain))
  // Parts held by a side-grain joint (in the build, or about to be), and how many joints each part has
  const sideHeld = new Set<string>()
  const jointsOf = new Map<string, number>()
  for (const j of [...taken, ...cands]) {
    if (!j.endGrain) [j.through.id, j.into.id].forEach((id) => sideHeld.add(id))
    ;[j.through.id, j.into.id].forEach((id) => jointsOf.set(id, (jointsOf.get(id) ?? 0) + 1))
  }
  const out: Record<string, ScrewEdit> = {}
  for (const j of cands) {
    // Into end grain, from a part that's already held on its side grain, into a part held by other joints: not needed
    if (j.endGrain && sideHeld.has(j.through.id) && (jointsOf.get(j.into.id) ?? 0) > 1) continue
    const n = j.dir.findIndex((v) => v !== 0)
    const [ua, va] = j.axes
    const box = j.area
    const margin = (i: number) => Math.min(15, (box.max[i] - box.min[i]) / 2)
    const inside = (p: Vec3) => [ua, va].every((i) => p[i] >= box.min[i] + margin(i) - 0.01 && p[i] <= box.max[i] - margin(i) + 0.01)
    const free = (p: Vec3, placed: ScrewLine[]) => {
      const [line] = screwLines(j, [p])
      return ![...lines, ...placed].some((l) => linesClash(l, line))
    }
    const steps = [0, 10, -10, 20, -20, 30, -30, 40, -40, 50, -50, 60, -60]
    const placed: ScrewLine[] = []
    const pts: Vec3[] = []
    let moved = false
    for (const p of j.points) {
      let spot: Vec3 | null = null
      search: for (const du of steps)
        for (const dv of steps.slice(0, 7)) {
          const q = [...p] as Vec3
          q[ua] += du
          q[va] += dv
          q[n] = p[n]
          if ((du || dv) && !inside(q)) continue
          if (free(q, placed)) {
            spot = q
            break search
          }
        }
      if (!spot) {
        moved = true
        continue
      }
      if (spot !== p && (spot[ua] !== p[ua] || spot[va] !== p[va])) moved = true
      pts.push(spot)
      placed.push(...screwLines(j, [spot]))
    }
    if (!pts.length) continue
    lines.push(...placed)
    out[j.key] = moved ? { on: true, points: pointOffsets(j, pts) } : { on: true }
  }
  return out
}

/** Screws from the other side: the joint's edit moves to the reversed key (hand-placed spots are dropped) */
export function reverseEdits(edits: Record<string, ScrewEdit>, key: string): Record<string, ScrewEdit> {
  const e = edits[key]
  if (!e) return edits
  const [a, b] = key.split('|')
  const { points: _drop, ...rest } = e
  const next = { ...edits }
  delete next[key]
  next[`${b}|${a}`] = Object.keys(rest).length ? rest : { on: true }
  return next
}
