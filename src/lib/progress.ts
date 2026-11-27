/**
 * Progress in the workshop (owner 2026-11-26): check-offs saved per project —
 * what's bought (Handla → Inköp), which pieces are cut (Verkstad → Kapa) and
 * which build steps are done (Verkstad → Montera). Not part of undo.
 *
 * Once a piece is checked off as cut, the model is locked: changing it would
 * make the cut list wrong. Unlocking empties the cut checklist.
 */
import type { CutRow } from './cutlist'
import type { Project } from './types'

export type CheckList = 'buy' | 'cut' | 'steps'
export type Checks = Partial<Record<CheckList, string[]>>

/** One cut-list row: same material, size and machining */
export const cutRowKey = (r: CutRow) => `${r.profile.id}|${r.length}|${r.width ?? ''}|${r.notes.join(';')}`

/** One key per piece to cut */
export const pieceKeys = (r: CutRow) => Array.from({ length: r.count }, (_, i) => `${cutRowKey(r)}#${i}`)

/** The model is locked while any piece is checked off as cut */
export const isLocked = (p: Pick<Project, 'checks'>) => (p.checks?.cut?.length ?? 0) > 0

/** Checked off → not, and back */
export function toggleCheck(checks: Checks | undefined, list: CheckList, key: string): Checks {
  const cur = checks?.[list] ?? []
  const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
  return { ...checks, [list]: next }
}

/** How many of these keys are checked off */
export const countDone = (checks: Checks | undefined, list: CheckList, keys: string[]) => {
  const done = new Set(checks?.[list] ?? [])
  return keys.filter((k) => done.has(k)).length
}
