import { getProfile } from './catalog'
import type { Part, PriceEntry, Profile } from './types'

export interface CutRow {
  profile: Profile
  length: number
  count: number
  names: string[]
}

/** Parts grouped by profile and length, longest first. */
export function cutList(parts: Part[]): CutRow[] {
  const rows = new Map<string, CutRow>()
  for (const part of parts) {
    const key = `${part.profileId}|${part.length}`
    let row = rows.get(key)
    if (!row) {
      row = { profile: getProfile(part.profileId), length: part.length, count: 0, names: [] }
      rows.set(key, row)
    }
    row.count++
    row.names.push(part.name)
  }
  return [...rows.values()].sort(
    (a, b) => a.profile.id.localeCompare(b.profile.id) || b.length - a.length,
  )
}

export interface StockBoard {
  length: number
  cuts: number[]
  /** Leftover after cuts and kerf */
  waste: number
}

export interface PlanRow {
  profile: Profile
  boards: StockBoard[]
  /** Cuts longer than the longest stock length */
  tooLong: number[]
  cost: number | null
  supplier: string | null
}

function used(cuts: number[], kerf: number): number {
  return cuts.reduce((s, c) => s + c, 0) + kerf * Math.max(0, cuts.length - 1)
}

/**
 * Decide which stock boards to buy for one profile: first-fit decreasing into
 * the longest stock length, then shrink each board to the shortest stock length
 * that still holds its cuts. Good enough for hobby projects; not optimal.
 */
export function packCuts(cuts: number[], stockLengths: number[], kerf: number): { boards: StockBoard[]; tooLong: number[] } {
  const stock = [...stockLengths].sort((a, b) => a - b)
  const longest = stock[stock.length - 1]
  const boards: number[][] = []
  const tooLong: number[] = []

  for (const cut of [...cuts].sort((a, b) => b - a)) {
    if (cut > longest) {
      tooLong.push(cut)
      continue
    }
    const fit = boards.find((b) => used([...b, cut], kerf) <= longest)
    if (fit) fit.push(cut)
    else boards.push([cut])
  }

  return {
    tooLong,
    boards: boards.map((b) => {
      const need = used(b, kerf)
      const length = stock.find((s) => s >= need) ?? longest
      return { length, cuts: b, waste: length - need }
    }),
  }
}

/** Cheapest price for one board of a given length, across all suppliers. */
export function boardPrice(
  profileId: string,
  length: number,
  prices: PriceEntry[],
): { price: number; supplier: string } | null {
  let best: { price: number; supplier: string } | null = null
  for (const e of prices) {
    if (e.profileId !== profileId) continue
    let price: number | null = null
    if (e.unit === 'lm') price = (e.price * length) / 1000
    else if (e.length === length) price = e.price
    if (price !== null && (!best || price < best.price)) best = { price, supplier: e.supplier }
  }
  return best
}

export function purchasePlan(parts: Part[], prices: PriceEntry[], kerf: number): PlanRow[] {
  const byProfile = new Map<string, number[]>()
  for (const p of parts) {
    const list = byProfile.get(p.profileId) ?? []
    list.push(p.length)
    byProfile.set(p.profileId, list)
  }
  return [...byProfile.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([profileId, cuts]) => {
      const profile = getProfile(profileId)
      const { boards, tooLong } = packCuts(cuts, profile.stockLengths, kerf)
      let cost: number | null = 0
      const suppliers = new Set<string>()
      for (const b of boards) {
        const bp = boardPrice(profileId, b.length, prices)
        if (!bp) {
          cost = null
          break
        }
        cost += bp.price
        suppliers.add(bp.supplier)
      }
      return { profile, boards, tooLong, cost, supplier: suppliers.size ? [...suppliers].join(', ') : null }
    })
}
