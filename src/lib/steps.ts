/**
 * Build steps: each group is a step (in the order the groups were made), and
 * a last "Montering" step puts everything together. Plus hiding parts.
 */
import type { Group, Part } from './types'

export const ASSEMBLY = 'montering'

export interface Step {
  /** A group id, or ASSEMBLY */
  id: string
  title: string
  /** The parts in this step; null = all parts (Montering) */
  partIds: Set<string> | null
}

export function buildSteps(parts: Part[], groups: Group[]): Step[] {
  const steps: Step[] = groups
    .map((g) => ({ id: g.id, title: g.name, partIds: new Set(parts.filter((p) => p.groupId === g.id).map((p) => p.id)) }))
    .filter((s) => s.partIds.size > 0)
  steps.push({ id: ASSEMBLY, title: 'Montering', partIds: null })
  return steps
}

/** Shown in 3D: not hidden, and in the active step (if any) */
export function isShown(part: Part, step: Step | null): boolean {
  return !part.hidden && (!step || !step.partIds || step.partIds.has(part.id))
}
