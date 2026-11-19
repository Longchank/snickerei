/**
 * "Smartast": where to split a framed sheet over its joists so the project's
 * sheets of that material need the fewest / cheapest store sheets.
 */
import { purchasePlan, type OwnSheetSizes, type SheetPlan } from './cutlist'
import { splitSheet } from './frame'
import type { Part, PriceEntry } from './types'

/** Try every combination up to this many joists; above it, at most MAX_SEAMS seams */
const ALL_COMBINATIONS_UP_TO = 10
const MAX_SEAMS = 3

/** Every set of joist numbers (1…n) to try as seams, fewest seams first */
function candidates(n: number): number[][] {
  const out: number[][] = [[]]
  const limit = n <= ALL_COMBINATIONS_UP_TO ? n : MAX_SEAMS
  const rec = (start: number, chosen: number[]) => {
    for (let i = start; i <= n; i++) {
      const next = [...chosen, i]
      out.push(next)
      if (next.length < limit) rec(i + 1, next)
    }
  }
  rec(1, [])
  return out.sort((a, b) => a.length - b.length)
}

export interface SeamChoice {
  seams: number[]
  /** The shopping-list row for this sheet's material with these seams */
  plan: SheetPlan | null
}

/** The shopping-list row for the sheet's material, with these seams */
export function sheetPlanWith(
  sheetId: string,
  seams: number[],
  parts: Part[],
  prices: PriceEntry[],
  kerf: number,
  sizes: OwnSheetSizes = {},
): SheetPlan | null {
  const sheet = parts.find((p) => p.id === sheetId)
  if (!sheet?.frame) return null
  const withSeams = parts.map((p) => (p.id === sheetId ? { ...p, frame: { ...p.frame!, seams } } : p))
  const row = purchasePlan(
    withSeams.filter((p) => p.profileId === sheet.profileId),
    prices,
    kerf,
    sizes,
  )[0]
  return row && row.kind === 'sheet' ? row : null
}

/**
 * The best seams: fewest pieces that don't fit any store sheet, then the
 * lowest cost (without prices: the least sheet area bought), then the fewest
 * seams. The project's other sheets of the same material count too, since
 * they share the store sheets.
 */
export function bestSeams(sheetId: string, parts: Part[], prices: PriceEntry[], kerf: number, sizes: OwnSheetSizes = {}): SeamChoice {
  const sheet = parts.find((p) => p.id === sheetId)
  if (!sheet?.frame || sheet.frame.joists < 1) return { seams: [], plan: null }
  let best: (SeamChoice & { score: number[] }) | null = null
  for (const seams of candidates(sheet.frame.joists)) {
    const plan = sheetPlanWith(sheetId, seams, parts, prices, kerf, sizes)
    if (!plan) continue
    const area = plan.sheets.reduce((a, s) => a + s.length * s.width, 0)
    // Last tie-break: the most even pieces (the longest piece as short as possible)
    const longest = Math.max(...splitSheet({ ...sheet, frame: { ...sheet.frame, seams } }).map((p) => Math.max(p.length, p.width ?? 0)))
    const score = [plan.tooLarge.length, Math.round(plan.cost ?? area / 1e4), seams.length, longest]
    if (!best || lexLess(score, best.score)) best = { seams, plan, score }
  }
  return best ? { seams: best.seams, plan: best.plan } : { seams: [], plan: null }
}

/** a < b, comparing element by element */
function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]
  return false
}
