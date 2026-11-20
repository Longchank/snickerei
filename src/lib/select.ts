/** Select by type: parts like the selected ones (same profile, or same profile and size). */
import type { Part } from './types'

const sizeOf = (p: Part) => (p.width === undefined ? `${p.length}` : `${p.length}x${p.width}`)

export interface SimilarChoice {
  /** 'profile' = every part of this profile; 'size' = also the same length (and width) */
  kind: 'profile' | 'size'
  ids: string[]
}

/**
 * What "select all like this" can offer for a selection: only when every
 * selected part has the same profile (and, for 'size', the same length).
 * `candidates` are the parts that may be selected (shown, not locked).
 */
export function similarChoices(chosen: Part[], candidates: Part[]): SimilarChoice[] {
  if (!chosen.length) return []
  const profile = chosen[0].profileId
  if (chosen.some((p) => p.profileId !== profile)) return []
  const out: SimilarChoice[] = []
  const sameSize = chosen.every((p) => sizeOf(p) === sizeOf(chosen[0]))
  const chosenIds = new Set(chosen.map((p) => p.id))
  const covers = (ids: string[]) => ids.length > chosen.length || ids.some((id) => !chosenIds.has(id))
  if (sameSize) {
    const ids = candidates.filter((p) => p.profileId === profile && sizeOf(p) === sizeOf(chosen[0])).map((p) => p.id)
    if (covers(ids)) out.push({ kind: 'size', ids })
  }
  const ids = candidates.filter((p) => p.profileId === profile).map((p) => p.id)
  if (covers(ids) && !(out[0] && out[0].ids.length === ids.length)) out.push({ kind: 'profile', ids })
  return out
}
