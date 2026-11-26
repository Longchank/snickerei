/**
 * The checklist before buying (step 3 Handla): everything the app already
 * detects, gathered in one place. Each issue says what's wrong, which parts,
 * where in 3D (for the "!" marker) and which step it's fixed in.
 */
import { partBox, toAxisBox } from './geometry'
import { overlapsOf, unionBox } from './joints'
import type { PlanRow } from './cutlist'
import { stockPieces } from './cutlist'
import { screwClashes, type Joint } from './screws'
import type { Analysis } from './strength'
import type { Part, Phase, Vec3 } from './types'

export type Severity = 'bad' | 'warn'

export interface Issue {
  id: string
  severity: Severity
  title: string
  detail: string
  partIds: string[]
  /** Where the "!" goes in 3D; null = nothing to point at (e.g. a missing price) */
  at: Vec3 | null
  /** The step where it's fixed */
  fix: Phase
}

const centre = (b: { min: Vec3; max: Vec3 }): Vec3 => [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2) as Vec3
/** Just above the top of a box, so the marker isn't buried in the wood */
const above = (b: { min: Vec3; max: Vec3 }): Vec3 => {
  const c = centre(b)
  return [c[0], b.max[1] + 30, c[2]]
}
const boxOf = (p: Part) => toAxisBox(partBox(p))
const mm = (v: number) => `${Math.round(v)} mm`

export function runChecks(parts: Part[], analysis: Analysis, joints: Joint[], plan: PlanRow[]): Issue[] {
  const issues: Issue[] = []
  const byId = new Map(parts.map((p) => [p.id, p]))

  // Collisions, each pair once
  const seen = new Set<string>()
  for (const p of parts)
    for (const o of overlapsOf(p, parts)) {
      const key = [p.id, o.other.id].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      issues.push({
        id: `krock:${key}`,
        severity: 'bad',
        title: `Krock: ${p.name} och ${o.other.name}`,
        detail: 'Delarna går in i varandra. Flytta en av dem, kapa den eller gör ett urtag.',
        partIds: [p.id, o.other.id],
        at: centre(o.box),
        fix: 'skissa',
      })
    }

  // Parts held up by nothing
  for (const id of analysis.floating) {
    const p = byId.get(id)
    if (!p) continue
    issues.push({
      id: `svavar:${id}`,
      severity: 'bad',
      title: `Svävar i luften: ${p.name}`,
      detail: 'Den vilar inte på något. Flytta ner den eller sätt något under.',
      partIds: [id],
      at: above(boxOf(p)),
      fix: 'skissa',
    })
  }

  // Strength
  for (const b of analysis.beams) {
    if (b.status === 'ok') continue
    const p = byId.get(b.partId)
    if (!p) continue
    issues.push({
      id: `balk:${b.partId}`,
      severity: b.status,
      title: `${b.status === 'bad' ? 'För svag' : 'Gränsfall'}: ${b.name}`,
      detail: `Böjer ${b.sag.toFixed(1).replace('.', ',')} mm över ${mm(b.span)} (gräns ${b.sagLimit.toFixed(1).replace('.', ',')} mm). Grövre virke, kortare spann eller en regel till.`,
      partIds: [b.partId],
      at: above(boxOf(p)),
      fix: 'detaljer',
    })
  }
  for (const s of analysis.posts) {
    if (s.status === 'ok') continue
    const p = byId.get(s.partId)
    if (!p) continue
    issues.push({
      id: `ben:${s.partId}`,
      severity: s.status,
      title: `${s.status === 'bad' ? 'För svagt ben' : 'Ben i gränsfall'}: ${s.name}`,
      detail: `Bär ${Math.round(s.loadKg)} kg, klarar ca ${Math.round(s.capacityKg)} kg (${s.capacityBy === 'buckling' ? 'knäcks' : 'trycks sönder'}). Grövre virke eller fler ben.`,
      partIds: [s.partId],
      at: centre(boxOf(p)),
      fix: 'detaljer',
    })
  }
  const all = unionBox(parts)
  // Low things (a board on the floor) don't tip in any way that matters
  if (analysis.tip && analysis.tip.status !== 'ok' && analysis.tip.height >= 400 && all)
    issues.push({
      id: 'tippar',
      severity: analysis.tip.status,
      title: `Kan tippa ${analysis.tip.direction}`,
      detail: `Det räcker med ca ${Math.round(analysis.tip.pushKg)} kg tryck upptill. Bredare fot, fäst i väggen eller tyngre nertill.`,
      partIds: [],
      at: above(all),
      fix: 'skissa',
    })
  if (analysis.rack && analysis.rack.status !== 'ok' && all)
    issues.push({
      id: 'vinglar',
      severity: 'warn',
      title: 'Kan vingla',
      detail: `Inget stagar ${analysis.rack.unbraced.join(' och ')}. En stående skiva (t.ex. en rygg) gör det stabilt.`,
      partIds: [],
      at: centre(all),
      fix: 'skissa',
    })

  // Screws
  for (const j of joints) {
    if (!j.count) continue // switched off by hand
    const key = `${j.through.id}|${j.into.id}`
    const at = j.points[0] ?? centre(boxOf(j.into))
    if (j.blockedBy)
      issues.push({
        id: `blockerad:${key}`,
        severity: 'warn',
        title: `Kommer inte åt att skruva: ${j.through.name} → ${j.into.name}`,
        detail: `${j.blockedBy} täcker sidan där skruven ska in. Skruva före ${j.blockedBy} sätts dit, snedskruva eller använd vinkeljärn.`,
        partIds: [j.through.id, j.into.id],
        at,
        fix: 'detaljer',
      })
    if (j.short)
      issues.push({
        id: `kort:${key}`,
        severity: 'warn',
        title: `Kort skruv: ${j.through.name} → ${j.into.name}`,
        detail: 'Delen bakom är tunn, så skruven blir kortare än tumregeln. Överväg vinkeljärn.',
        partIds: [j.through.id, j.into.id],
        at,
        fix: 'detaljer',
      })
  }

  // Screws that run into each other (two joints in the same spot of wood)
  for (const c of screwClashes(joints.filter((j) => j.count > 0)))
    issues.push({
      id: `krockskruv:${c.a.key}:${c.b.key}`,
      severity: 'warn',
      title: `Skruvar krockar: ${c.a.through.name} → ${c.a.into.name}`,
      detail: `Går in i skruvarna i ${c.b.through.name} → ${c.b.into.name}. Flytta eller ta bort en av dem (tryck på skruven i Detaljer).`,
      partIds: [...new Set([c.a.through.id, c.a.into.id, c.b.through.id, c.b.into.id])],
      at: c.at,
      fix: 'detaljer',
    })

  // Buying: pieces the store doesn't sell that big, and missing prices
  const pieces = stockPieces(parts)
  const base = (id: string) => id.split('#')[0]
  for (const row of plan) {
    const ofProfile = pieces.filter((p) => p.profileId === row.profile.id)
    if (row.kind === 'board') {
      const long = ofProfile.filter((p) => p.length > row.longestStock)
      for (const p of long) {
        const part = byId.get(base(p.id))
        if (!part) continue
        issues.push({
          id: `lang:${p.id}`,
          severity: 'bad',
          title: `För lång för butiken: ${p.name}`,
          detail: `${mm(p.length)}, men längsta ${row.profile.name} är ${mm(row.longestStock)}. Korta den eller skarva.`,
          partIds: [part.id],
          at: above(boxOf(part)),
          fix: 'detaljer',
        })
      }
    } else {
      const [sl, sw] = row.sheetSize
      const fits = (l: number, w: number) => (l <= sl && w <= sw) || (l <= sw && w <= sl)
      for (const p of ofProfile) {
        if (fits(p.length, p.width ?? 0)) continue
        const part = byId.get(base(p.id))
        if (!part) continue
        issues.push({
          id: `stor:${p.id}`,
          severity: 'bad',
          title: `Större än en skiva i butiken: ${p.name}`,
          detail: `${mm(p.length)} × ${mm(p.width ?? 0)}, skivan är ${sl}×${sw}. Skarva skivan över en regel (ram under skivan → Skarvar).`,
          partIds: [part.id],
          at: above(boxOf(part)),
          fix: 'detaljer',
        })
      }
    }
    if (row.items.some((i) => i.unitPrice === null))
      issues.push({
        id: `pris:${row.profile.id}`,
        severity: 'warn',
        title: `Pris saknas: ${row.profile.name}`,
        detail: 'Lägg in ett eget pris under Priser, annars räknas totalen utan det.',
        partIds: [],
        at: null,
        fix: 'handla',
      })
    else if (row.items.some((i) => i.offer?.supplier === 'Exempel'))
      issues.push({
        id: `exempel:${row.profile.id}`,
        severity: 'warn',
        title: `Exempelpris: ${row.profile.name}`,
        detail: 'Priset är ett påhittat exempel, inte ett riktigt butikspris. Lägg in vad det kostar i din butik.',
        partIds: [],
        at: null,
        fix: 'handla',
      })
  }
  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'bad' ? -1 : 1))
}
