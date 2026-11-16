import { describe, expect, it } from 'vitest'
import { packCuts, purchasePlan } from './cutlist'
import { mergePrices, supplierEntries } from './prices'
import type { Part, PriceEntry, SupplierPriceFile } from './types'

const file: SupplierPriceFile = {
  supplier: 'Bauhaus',
  website: 'https://www.bauhaus.se',
  fetchedAt: '2026-11-16T00:00:00Z',
  products: [
    // 45x70: per-metre price is higher for the short length
    { sku: '1', name: 'REGEL 45X70X2500MM', url: 'u1', kind: 'board', category: 'konstruktion', thickness: 45, width: 70, length: 2500, price: 65.88 },
    { sku: '2', name: 'REGEL 45X70X3000MM', url: 'u2', kind: 'board', category: 'konstruktion', thickness: 45, width: 70, length: 3000, price: 75.75 },
    { sku: '3', name: 'REGEL 45X70X4200MM', url: 'u3', kind: 'board', category: 'konstruktion', thickness: 45, width: 70, length: 4200, price: 106.05 },
    // plywood 18: a big sheet that is pricier per m² than the standard one
    { sku: '4', name: 'PLYWOOD 18X1200X2500MM', url: 'u4', kind: 'sheet', category: 'plywood', thickness: 18, width: 1200, length: 2500, price: 679 },
    { sku: '5', name: 'PLYWOOD 18X1525X3050MM', url: 'u5', kind: 'sheet', category: 'plywood', thickness: 18, width: 1525, length: 3050, price: 2345 },
    // not in the catalog
    { sku: '6', name: 'LÄKT 12X50X3000MM', url: 'u6', kind: 'board', category: 'lakt', thickness: 12, width: 50, length: 3000, price: 23.85 },
  ],
}

const part = (profileId: string, length: number, width?: number): Part => ({
  id: Math.random().toString(),
  name: 'Del',
  profileId,
  length,
  width,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
})

describe('supplierEntries', () => {
  it('maps products to catalog profiles and drops unknown sizes', () => {
    const e = supplierEntries(file)
    expect(e.map((x) => x.profileId)).toEqual([
      'konstruktion-45x70',
      'konstruktion-45x70',
      'konstruktion-45x70',
      'plywood-18',
      'plywood-18',
    ])
    expect(e[0]).toMatchObject({ unit: 'st', length: 2500, price: 65.88, supplier: 'Bauhaus', url: 'u1' })
    expect(e[3]).toMatchObject({ length: 2500, width: 1200 })
  })
})

describe('mergePrices', () => {
  it('prefers own prices, then suppliers, then examples, per profile', () => {
    const own: PriceEntry[] = [{ profileId: 'a', supplier: 'Egen', unit: 'lm', price: 1 }]
    const sup: PriceEntry[] = [
      { profileId: 'a', supplier: 'S', unit: 'st', length: 3000, price: 2 },
      { profileId: 'b', supplier: 'S', unit: 'st', length: 3000, price: 2 },
    ]
    const ex: PriceEntry[] = ['a', 'b', 'c'].map((id) => ({ profileId: id, supplier: 'Exempel', unit: 'lm', price: 9 }))
    expect(mergePrices(own, sup, ex).map((e) => `${e.profileId}:${e.supplier}`)).toEqual(['a:Egen', 'b:S', 'c:Exempel'])
  })
})

describe('purchasePlan with supplier prices', () => {
  const prices = supplierEntries(file)

  it('buys lengths the supplier sells, choosing the cheapest that fits', () => {
    // 2400 fits in 2500 (65.88) and 3000 (75.75): take 2500
    const [row] = purchasePlan([part('konstruktion-45x70', 2400)], prices, 3)
    expect(row.items).toMatchObject([{ length: 2500, count: 1, unitPrice: 65.88 }])
    expect(row.items[0].offer).toMatchObject({ supplier: 'Bauhaus', url: 'u1' })
    expect(row.cost).toBeCloseTo(65.88)
  })

  it('reports cuts longer than the longest length on offer', () => {
    const [row] = purchasePlan([part('konstruktion-45x70', 5000)], prices, 3)
    expect(row.kind === 'board' && row.tooLong).toEqual([5000])
    expect(row.kind === 'board' && row.longestStock).toBe(4200)
  })

  it('picks the cheapest sheet size, not the largest', () => {
    const [row] = purchasePlan([part('plywood-18', 800, 600)], prices, 3)
    expect(row.kind === 'sheet' && row.sheetSize).toEqual([2500, 1200])
    expect(row.cost).toBe(679)
  })

  it('falls back to the catalog sizes without supplier prices', () => {
    const [row] = purchasePlan([part('konstruktion-45x95', 1000)], [], 3)
    expect(row.items[0]).toMatchObject({ length: 3000, unitPrice: null })
    expect(row.cost).toBeNull()
  })
})

describe('packCuts with prices', () => {
  it('prefers two short boards over a long one plus an offcut when cheaper', () => {
    // Bauhaus 45x70 per piece: 2500 → 65.88, 3000 → 75.75, 5400 → 136.35
    const price: Record<number, number> = { 2500: 65.88, 3000: 75.75, 5400: 136.35 }
    const { boards } = packCuts([900, 900, 900, 900, 1160, 1160], [2500, 3000, 5400], 3, (l) => price[l])
    expect(boards.map((b) => b.length)).toEqual([3000, 3000])
  })

  it('chooses a longer board when it is cheaper', () => {
    const { boards } = packCuts([2000], [2500, 3000], 3, (len) => (len === 2500 ? 80 : 70))
    expect(boards[0].length).toBe(3000)
  })
})

describe('price age', () => {
  it('formats the age in Swedish', async () => {
    const { formatAge, ageInDays } = await import('./format')
    const now = new Date('2026-11-20T10:00:00')
    expect(formatAge('2026-11-20T04:00:00', now)).toBe('idag')
    expect(formatAge('2026-11-19T23:00:00', now)).toBe('igår')
    expect(formatAge('2026-11-16T04:17:00', now)).toBe('för 4 dagar sedan')
    expect(ageInDays('2026-10-01T00:00:00', now)).toBe(50)
  })

  it('reports each supplier with its oldest price date', async () => {
    const { priceDates } = await import('./cutlist')
    const older = { ...file, fetchedAt: '2026-11-01T00:00:00Z' }
    const prices = [...supplierEntries(older).filter((e) => e.profileId === 'plywood-18'), ...supplierEntries(file)]
    const plan = purchasePlan([part('konstruktion-45x70', 2400), part('plywood-18', 800, 600)], prices, 3)
    expect(priceDates(plan)).toEqual([{ supplier: 'Bauhaus', fetchedAt: '2026-11-01T00:00:00Z' }])
  })
})
