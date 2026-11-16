import { getProfile } from './catalog'
import { describeCuts } from './cuts'
import { describeNotch } from './joints'
import type { Part, PriceEntry, Profile } from './types'

export interface CutRow {
  profile: Profile
  length: number
  /** Sheets only */
  width?: number
  count: number
  names: string[]
  /** Machining after cutting to length (joints), from one of the identical parts */
  notes: string[]
}

const partWidth = (part: Part, prof: Profile) => (prof.kind === 'sheet' ? (part.width ?? prof.width) : undefined)

/**
 * The pieces to cut from stock: both halves of a ripped board (French cleat)
 * come from one piece, so only the first half found counts.
 */
export function stockPieces(parts: Part[]): Part[] {
  const seen = new Set<string>()
  return parts.filter((p) => {
    if (!p.rip) return true
    if (seen.has(p.rip.id)) return false
    seen.add(p.rip.id)
    return true
  })
}

function ripNote(part: Part, parts: Part[]): string | null {
  if (!part.rip) return null
  const angle = String(part.rip.angle).replace('.', ',')
  const both = parts.filter((p) => p.rip?.id === part.rip!.id).length === 2
  return both
    ? `Klyvs på längden i ${angle}° till två delar (fransk list)`
    : `Klyvs på längden i ${angle}°, ena halvan används`
}

/** Parts grouped by material and size, largest first. */
export function cutList(parts: Part[]): CutRow[] {
  const rows = new Map<string, CutRow>()
  for (const part of stockPieces(parts)) {
    const profile = getProfile(part.profileId)
    const width = partWidth(part, profile)
    // Parts with different joints and cuts are different pieces in the workshop
    const notes = [
      ...describeCuts(part),
      ...(part.notches ?? []).map((n) => describeNotch(part, n)),
      ...[ripNote(part, parts)].filter((n): n is string => n !== null),
    ]
    const key = `${part.profileId}|${part.length}|${width ?? ''}|${notes.join(';')}`
    let row = rows.get(key)
    if (!row) {
      row = { profile, length: part.length, width, count: 0, names: [], notes }
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
 * Decide which stock boards to buy for one profile. For each stock length,
 * pack the cuts first-fit decreasing into boards of that length, then give each
 * board the stock length that holds its cuts at the lowest price; keep the
 * cheapest overall result (without prices: the least timber bought). Good
 * enough for hobby projects; not optimal.
 */
export function packCuts(
  cuts: number[],
  stockLengths: number[],
  kerf: number,
  priceOf: (length: number) => number | null = () => null,
): { boards: StockBoard[]; tooLong: number[] } {
  const stock = [...new Set(stockLengths)].sort((a, b) => a - b)
  const longest = stock[stock.length - 1]
  const tooLong = cuts.filter((c) => c > longest)
  const sorted = cuts.filter((c) => c <= longest).sort((a, b) => b - a)
  if (!sorted.length) return { boards: [], tooLong }

  const pickLength = (need: number) => {
    const fitting = stock.filter((s) => s >= need)
    const priced = fitting
      .map((len) => ({ len, price: priceOf(len) }))
      .filter((x): x is { len: number; price: number } => x.price !== null)
    return priced.length ? priced.reduce((best, x) => (x.price < best.price ? x : best)).len : fitting[0]
  }

  let best: { boards: StockBoard[]; score: number } | null = null
  const strategies = sorted.length <= 60 ? [firstFit, bestFill] : [firstFit]
  for (const binLength of stock.filter((s) => s >= sorted[0]))
    for (const pack of strategies) {
    const bins = pack(sorted, binLength, kerf)
    const boards = bins.map((b) => {
      const need = used(b, kerf)
      const length = pickLength(need)
      return { length, cuts: b, waste: length - need }
    })
    const prices = boards.map((b) => priceOf(b.length))
    const score = prices.every((p) => p !== null)
      ? prices.reduce((a, p) => a + p!, 0)
      : boards.reduce((a, b) => a + b.length, 0) * 1e6
    if (!best || score < best.score - 1e-9 || (Math.abs(score - best.score) < 1e-9 && boards.length < best.boards.length))
      best = { boards, score }
    }
  return { boards: best!.boards, tooLong }
}

/** First-fit decreasing: each cut goes on the first board with room. */
function firstFit(sorted: number[], binLength: number, kerf: number): number[][] {
  const bins: number[][] = []
  for (const cut of sorted) {
    const fit = bins.find((b) => used([...b, cut], kerf) <= binLength)
    if (fit) fit.push(cut)
    else bins.push([cut])
  }
  return bins
}

/**
 * Fill one board at a time with the combination of remaining cuts that leaves
 * the least waste (subset sum; each cut also uses one kerf).
 */
function bestFill(sorted: number[], binLength: number, kerf: number): number[][] {
  const remaining = [...sorted]
  const bins: number[][] = []
  const cap = Math.floor(binLength + kerf)
  while (remaining.length) {
    // reach[w] = index of the last item used to reach total w, or -1
    const reach = new Int32Array(cap + 1).fill(-2)
    const prev = new Int32Array(cap + 1)
    reach[0] = -1
    remaining.forEach((cut, i) => {
      const w = Math.ceil(cut + kerf)
      for (let t = cap; t >= w; t--)
        if (reach[t] === -2 && reach[t - w] !== -2) {
          reach[t] = i
          prev[t] = t - w
        }
    })
    let t = cap
    while (reach[t] === -2) t--
    const picked = new Set<number>()
    for (; t > 0; t = prev[t]) picked.add(reach[t])
    bins.push(remaining.filter((_, i) => picked.has(i)))
    for (const i of [...picked].sort((a, b) => b - a)) remaining.splice(i, 1)
  }
  return bins
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

export interface Offer {
  price: number
  supplier: string
  url?: string
  name?: string
  /** When the supplier price was collected (ISO) */
  fetchedAt?: string
}

/** Cheapest price for one stock board/sheet, across all suppliers. */
export function stockPrice(profileId: string, length: number, width: number | null, prices: PriceEntry[]): Offer | null {
  let best: Offer | null = null
  for (const e of prices) {
    if (e.profileId !== profileId) continue
    let price: number | null = null
    if (e.unit === 'lm') {
      if (e.length === undefined || e.length === length) price = (e.price * length) / 1000
    } else if (e.unit === 'm2') {
      if (width !== null) price = (e.price * length * width) / 1e6
    } else if (e.length === undefined) {
      // A per-piece price without a size: any sheet
      if (width !== null) price = e.price
    } else if (e.length === length && (e.width === undefined || e.width === width)) {
      price = e.price
    }
    if (price !== null && (!best || price < best.price))
      best = { price, supplier: e.supplier, url: e.url, name: e.name, fetchedAt: e.fetchedAt }
  }
  return best
}

/** Stock sizes on offer: the sizes suppliers list, or the catalog's typical sizes. */
export function stockOptions(profile: Profile, prices: PriceEntry[]): { lengths: number[]; sheets: [number, number][] } {
  const own = prices.filter((e) => e.profileId === profile.id && e.length !== undefined)
  if (profile.kind === 'sheet') {
    const sizes = new Map<string, [number, number]>()
    for (const e of own) if (e.width !== undefined) sizes.set(`${e.length}x${e.width}`, [e.length!, e.width])
    return { lengths: [], sheets: sizes.size ? [...sizes.values()] : profile.stockSheets }
  }
  const lengths = [...new Set(own.map((e) => e.length!))]
  return { lengths: lengths.length ? lengths : profile.stockLengths, sheets: [] }
}

// ---------------------------------------------------------------- plan

/** One line of the shopping list: n pieces of one stock size. */
export interface PlanItem {
  length: number
  /** Sheets only */
  width?: number
  count: number
  /** Per piece, null if unknown */
  unitPrice: number | null
  offer: Offer | null
}

interface PlanBase {
  profile: Profile
  items: PlanItem[]
  cost: number | null
  supplier: string | null
}
export interface BoardPlan extends PlanBase {
  kind: 'board'
  boards: StockBoard[]
  /** Cuts longer than the longest stock length */
  tooLong: number[]
  longestStock: number
}
export interface SheetPlan extends PlanBase {
  kind: 'sheet'
  sheets: StockSheet[]
  tooLarge: [number, number][]
  /** The sheet size used */
  sheetSize: [number, number]
}
export type PlanRow = BoardPlan | SheetPlan

function summarize(
  profile: Profile,
  stock: { length: number; width?: number }[],
  prices: PriceEntry[],
): Pick<PlanBase, 'items' | 'cost' | 'supplier'> {
  const items = new Map<string, PlanItem>()
  for (const s of stock) {
    const key = `${s.length}x${s.width ?? ''}`
    const item = items.get(key)
    if (item) item.count++
    else {
      const offer = stockPrice(profile.id, s.length, s.width ?? null, prices)
      items.set(key, { length: s.length, width: s.width, count: 1, unitPrice: offer?.price ?? null, offer })
    }
  }
  const list = [...items.values()].sort((a, b) => b.length - a.length || (b.width ?? 0) - (a.width ?? 0))
  const cost = list.every((i) => i.unitPrice !== null)
    ? list.reduce((sum, i) => sum + i.count * i.unitPrice!, 0)
    : null
  const suppliers = [...new Set(list.map((i) => i.offer?.supplier).filter(Boolean))]
  return { items: list, cost, supplier: cost !== null && suppliers.length ? suppliers.join(', ') : null }
}

export function purchasePlan(parts: Part[], prices: PriceEntry[], kerf: number): PlanRow[] {
  const byProfile = new Map<string, Part[]>()
  for (const p of stockPieces(parts)) byProfile.set(p.profileId, [...(byProfile.get(p.profileId) ?? []), p])

  return [...byProfile.entries()]
    .map(([profileId, ps]): PlanRow => {
      const profile = getProfile(profileId)
      const options = stockOptions(profile, prices)

      if (profile.kind === 'sheet') {
        const pieces = ps.map((p) => [p.length, p.width ?? profile.width] as [number, number])
        // Try each sheet size on offer and keep the cheapest result
        // (without prices: the least sheet area bought)
        let best: (SheetPlan & { score: [number, number] }) | null = null
        for (const size of options.sheets) {
          const { sheets, tooLarge } = packSheets(pieces, [size], kerf)
          const summary = summarize(
            profile,
            sheets.map((s) => ({ length: s.length, width: s.width })),
            prices,
          )
          const area = sheets.reduce((a, s) => a + s.length * s.width, 0)
          const score: [number, number] = [tooLarge.length, summary.cost ?? area * 1e6]
          if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1]))
            best = { kind: 'sheet', profile, sheets, tooLarge, sheetSize: size, ...summary, score }
        }
        const { score: _score, ...plan } = best!
        return plan
      }

      const priceOf = (length: number) => stockPrice(profileId, length, null, prices)?.price ?? null
      const { boards, tooLong } = packCuts(
        ps.map((p) => p.length),
        options.lengths,
        kerf,
        priceOf,
      )
      return {
        kind: 'board',
        profile,
        boards,
        tooLong,
        longestStock: Math.max(...options.lengths),
        ...summarize(profile, boards, prices),
      }
    })
    .sort((a, b) => a.profile.kind.localeCompare(b.profile.kind) || a.profile.id.localeCompare(b.profile.id))
}

/** Each supplier used in a plan with the oldest collection date of its prices. */
export function priceDates(plan: PlanRow[]): { supplier: string; fetchedAt: string }[] {
  const oldest = new Map<string, string>()
  for (const r of plan)
    for (const i of r.items) {
      const o = i.offer
      if (o?.fetchedAt && (!oldest.has(o.supplier) || o.fetchedAt < oldest.get(o.supplier)!))
        oldest.set(o.supplier, o.fetchedAt)
    }
  return [...oldest].map(([supplier, fetchedAt]) => ({ supplier, fetchedAt }))
}

export function totalCost(plan: PlanRow[]): number | null {
  return plan.every((r) => r.cost !== null) ? plan.reduce((s, r) => s + (r.cost ?? 0), 0) : null
}
