/**
 * Start-page templates (owner 2026-11-26: "Bänk and Bord first"): ask only
 * the outer size and get a finished model to start from — a plywood top on a
 * frame (Ram under skivan) with four legs inside the corners, grouped as
 * Ram and Ben so the build steps make sense straight away, and the purpose
 * set so the strength analysis uses the right loads.
 */
import { buildFrame, defaultJoists } from './frame'
import { normalizeProject } from './store'
import type { Group, Part, Project, Purpose } from './types'

export type TemplateId = 'bank' | 'bord'

export interface Template {
  id: TemplateId
  name: string
  /** One line under the name */
  hint: string
  /** Outer length × depth × height, mm */
  size: [number, number, number]
  purpose: Purpose
  top: string
  frame: string
  legs: string
}

export const TEMPLATES: Template[] = [
  {
    id: 'bank',
    name: 'Bänk',
    hint: 'Sittbänk med skiva, ram och fyra ben',
    size: [1200, 400, 450],
    purpose: 'bank',
    top: 'plywood-18',
    frame: 'konstruktion-45x70',
    legs: 'konstruktion-45x70',
  },
  {
    id: 'bord',
    name: 'Bord',
    hint: 'Bord med skiva, ram och fyra ben',
    size: [1200, 800, 750],
    purpose: 'bord',
    top: 'plywood-18',
    frame: 'konstruktion-45x70',
    legs: 'konstruktion-45x95',
  },
]

/** Sizes a template accepts, mm: [min, max] for length, depth, height */
export const SIZE_LIMITS: [number, number][] = [
  [300, 3000],
  [200, 1200],
  [200, 1200],
]

export const clampSize = (size: number[]): [number, number, number] =>
  size.map((v, i) => Math.round(Math.min(SIZE_LIMITS[i][1], Math.max(SIZE_LIMITS[i][0], v || 0)))) as [number, number, number]

const uid = () => Math.random().toString(36).slice(2, 10)

/** The model for a template at the given outer size (length along x, depth along z, height up) */
export function buildTemplate(id: TemplateId, size: number[], name?: string): Project {
  const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0]
  const [L, D, H] = clampSize(size)
  const sheet: Part = {
    id: uid(),
    name: 'Skiva',
    profileId: t.top,
    length: L,
    width: D,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  }
  const built = buildFrame(sheet, {
    profileId: t.frame,
    joists: defaultJoists(sheet),
    onEdge: true,
    legs: { profileId: t.legs, placement: 'inside', height: H },
  })
  const ram: Group = { id: uid(), name: 'Ram' }
  const ben: Group = { id: uid(), name: 'Ben' }
  // The top goes on last (Montering), so it stays loose
  const parts: Part[] = [
    ...built.parts.map((p) => ({ ...p, groupId: p.name.startsWith('Ben') ? ben.id : ram.id })),
    { ...built.sheet, groupId: undefined },
  ]
  return normalizeProject({ name: name?.trim() || t.name, parts, groups: [ram, ben], measurements: [], purpose: t.purpose })
}
