import { getProfile } from './catalog'
import type { Part, PriceEntry, Profile } from './types'

export interface CutRow {
  profile: Profile
  length: number
  /** Sheets only */
  width?: number
  count: number
  names: string[]
}

const partWidth = (part: Part, prof: Profile) => (prof.kind === 'sheet' ? (part.width ?? prof.width) : undefined)

/** Parts grouped by material and size, largest first. */
export function cutList(parts: Part[]): CutRow[] {
  const rows = new Map<string, CutRow>()
  for (const part of parts) {
    const profile = getProfile(part.profileId)
    const width = partWidth(part, profile)
    const key = `${part.profileId}|${part.length}|${width ?? ''}`
    let row = rows.get(key)
    if (!row) {
      row = { profile, length: part.length, width, count: 0, names: [] }
      rows.set(key, row)
    }
    row.count++
    row.names.push(part.name)
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.profile.kind.localeCompare(b.profile.kind) ||
      a.profile.id.localeCompare(b.profile.id) ||
      b.length - a.length ||
      (b.width ?? 0) - (a.width ?? 0),
  )
}

// ---------------------------------------------------------------- boards

export interface StockBoard {
  length: number
  cuts: number[]
  /** Leftover after cuts and kerf */
  waste: number
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

// ---------------------------------------------------------------- sheets

export interface Placement {
  x: number
  y: number
  /** Size as placed (may be rotated relative to the part) */
  w: number
  h: number
  rotated: boolean
}

export interface StockSheet {
  length: number
  width: number
  pieces: Placement[]
  /** Fraction of the sheet area used by pieces, 0–1 */
  usage: number
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Nest rectangular pieces onto stock sheets with guillotine cuts (every cut goes
 * straight across a piece of the sheet, as with a circular saw or track saw).
 * Pieces may be rotated 90°; grain direction is ignored. Best-short-side-fit
 * heuristic — good, not optimal.
 */
export function packSheets(
  pieces: [number, number][],
  stockSheets: [number, number][],
  kerf: number,
): { sheets: StockSheet[]; tooLarge: [number, number][] } {
  // Use the largest stock sheet for nesting
  const [sl, sw] = [...stockSheets].sort((a, b) => b[0] * b[1] - a[0] * a[1])[0]
  const sheets: { free: Rect[]; pieces: Placement[] }[] = []
  const tooLarge: [number, number][] = []

  const sorted = [...pieces].sort((a, b) => b[0] * b[1] - a[0] * a[1] || Math.max(...b) - Math.max(...a))
  for (const [pl, pw] of sorted) {
    const fitsSheet = (pl <= sl && pw <= sw) || (pw <= sl && pl <= sw)
    if (!fitsSheet) {
      tooLarge.push([pl, pw])
      continue
    }
    let best: { sheet: number; rect: number; w: number; h: number; rotated: boolean; score: number } | null = null
    const tryPlace = (si: number) => {
      sheets[si].free.forEach((r, ri) => {
        for (const [w, h, rotated] of [
          [pl, pw, false],
          [pw, pl, true],
        ] as const) {
          if (w <= r.w && h <= r.h) {
            const score = Math.min(r.w - w, r.h - h)
            if (!best || score < best.score) best = { sheet: si, rect: ri, w, h, rotated, score }
          }
        }
      })
    }
    sheets.forEach((_, si) => tryPlace(si))
    if (!best) {
      sheets.push({ free: [{ x: 0, y: 0, w: sl, h: sw }], pieces: [] })
      tryPlace(sheets.length - 1)
    }
    const b = best as unknown as { sheet: number; rect: number; w: number; h: number; rotated: boolean }
    const sheet = sheets[b.sheet]
    const r = sheet.free[b.rect]
    sheet.pieces.push({ x: r.x, y: r.y, w: b.w, h: b.h, rotated: b.rotated })

    // Guillotine split of the leftover, leaving a kerf between piece and offcut.
    // Split along the shorter leftover so the bigger offcut stays in one piece.
    const rightW = r.w - b.w - kerf
    const topH = r.h - b.h - kerf
    const splitVertical = r.w - b.w > r.h - b.h
    const next: Rect[] = []
    if (splitVertical) {
      if (rightW > 0) next.push({ x: r.x + b.w + kerf, y: r.y, w: rightW, h: r.h })
      if (topH > 0) next.push({ x: r.x, y: r.y + b.h + kerf, w: b.w, h: topH })
    } else {
      if (rightW > 0) next.push({ x: r.x + b.w + kerf, y: r.y, w: rightW, h: b.h })
      if (topH > 0) next.push({ x: r.x, y: r.y + b.h + kerf, w: r.w, h: topH })
    }
    sheet.free.splice(b.rect, 1, ...next)
  }

  return {
    tooLarge,
    sheets: sheets.map((s) => ({
      length: sl,
      width: sw,
      pieces: s.pieces,
      usage: s.pieces.reduce((a, p) => a + p.w * p.h, 0) / (sl * sw),
    })),
  }
}

// ---------------------------------------------------------------- prices

/** Cheapest price for one stock board/sheet, across all suppliers. */
export function stockPrice(
  profileId: string,
  length: number,
  width: number | null,
  prices: PriceEntry[],
): { price: number; supplier: string } | null {
  let best: { price: number; supplier: string } | null = null
  for (const e of prices) {
    if (e.profileId !== profileId) continue
    let price: number | null = null
    if (e.unit === 'lm') price = (e.price * length) / 1000
    else if (e.unit === 'm2' && width !== null) price = (e.price * length * width) / 1e6
    else if (e.unit === 'st') {
      const lengthOk = e.length === undefined ? width !== null : e.length === length
      const widthOk = e.width === undefined || e.width === width
      if (lengthOk && widthOk) price = e.price
    }
    if (price !== null && (!best || price < best.price)) best = { price, supplier: e.supplier }
  }
  return best
}

// ---------------------------------------------------------------- plan

interface PlanBase {
  profile: Profile
  cost: number | null
  supplier: string | null
}
export interface BoardPlan extends PlanBase {
  kind: 'board'
  boards: StockBoard[]
  /** Cuts longer than the longest stock length */
  tooLong: number[]
}
export interface SheetPlan extends PlanBase {
  kind: 'sheet'
  sheets: StockSheet[]
  tooLarge: [number, number][]
}
export type PlanRow = BoardPlan | SheetPlan

export function purchasePlan(parts: Part[], prices: PriceEntry[], kerf: number): PlanRow[] {
  const byProfile = new Map<string, Part[]>()
  for (const p of parts) byProfile.set(p.profileId, [...(byProfile.get(p.profileId) ?? []), p])

  return [...byProfile.entries()]
    .map(([profileId, ps]): PlanRow => {
      const profile = getProfile(profileId)
      const suppliers = new Set<string>()
      let cost: number | null = 0
      const addCost = (length: number, width: number | null) => {
        const sp = stockPrice(profileId, length, width, prices)
        if (!sp || cost === null) cost = null
        else {
          cost += sp.price
          suppliers.add(sp.supplier)
        }
      }
      const supplier = () => (suppliers.size && cost !== null ? [...suppliers].join(', ') : null)

      if (profile.kind === 'sheet') {
        const pieces = ps.map((p) => [p.length, p.width ?? profile.width] as [number, number])
        const { sheets, tooLarge } = packSheets(pieces, profile.stockSheets, kerf)
        sheets.forEach((s) => addCost(s.length, s.width))
        return { kind: 'sheet', profile, sheets, tooLarge, cost, supplier: supplier() }
      }
      const { boards, tooLong } = packCuts(
        ps.map((p) => p.length),
        profile.stockLengths,
        kerf,
      )
      boards.forEach((b) => addCost(b.length, null))
      return { kind: 'board', profile, boards, tooLong, cost, supplier: supplier() }
    })
    .sort((a, b) => a.profile.kind.localeCompare(b.profile.kind) || a.profile.id.localeCompare(b.profile.id))
}

export function totalCost(plan: PlanRow[]): number | null {
  return plan.every((r) => r.cost !== null) ? plan.reduce((s, r) => s + (r.cost ?? 0), 0) : null
}
