import { describe, expect, it } from 'vitest'
import { cutList, packCuts, packSheets, purchasePlan, stockOptions, stockPrice } from './cutlist'
import { PROFILES } from './catalog'
import { partBox, rotatePart, snapOffset } from './geometry'
import type { Part } from './types'

const part = (length: number, extra: Partial<Part> = {}): Part => ({
  id: String(Math.random()),
  name: 'Del',
  profileId: 'konstruktion-45x70',
  length,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  ...extra,
})

describe('packCuts', () => {
  it('packs cuts with kerf, buying the least timber without prices', () => {
    const { boards, tooLong } = packCuts([1800, 1800, 900], [3000, 3600, 4200], 3)
    expect(tooLong).toEqual([])
    // 1800 + 3 + 1800 = 3603 needs a 4200 (+ a 3000 for the 900) = 7.2 m;
    // 1800 + 3 + 900 on one 3000 and 1800 on another = 6 m
    expect(boards.map((b) => [b.length, b.cuts])).toEqual([
      [3000, [1800, 900]],
      [3000, [1800]],
    ])
  })

  it('respects kerf exactly at the limit', () => {
    // 1498 + 3 + 1499 = 3000 fits one board; 1499 + 3 + 1499 does not
    expect(packCuts([1498, 1499], [3000], 3).boards).toHaveLength(1)
    expect(packCuts([1499, 1499], [3000], 3).boards).toHaveLength(2)
  })

  it('reports cuts longer than any stock length', () => {
    expect(packCuts([6000], [3000, 5400], 3).tooLong).toEqual([6000])
  })
})

describe('cutList', () => {
  it('groups identical parts', () => {
    const rows = cutList([part(1000), part(1000), part(500)])
    expect(rows.map((r) => [r.length, r.count])).toEqual([
      [1000, 2],
      [500, 1],
    ])
  })
})

describe('stockPrice', () => {
  it('picks the cheapest of per-metre and per-piece prices', () => {
    const prices = [
      { profileId: 'p', supplier: 'A', unit: 'lm' as const, price: 30 },
      { profileId: 'p', supplier: 'B', unit: 'st' as const, length: 3000, price: 80 },
    ]
    expect(stockPrice('p', 3000, null, prices)).toEqual({ price: 80, supplier: 'B' })
    expect(stockPrice('p', 3600, null, prices)).toEqual({ price: 108, supplier: 'A' })
  })
})

describe('rotatePart', () => {
  it('stands a board up while keeping its min corner in place', () => {
    const p = part(1000, { position: [100, 0, 200] })
    const r = rotatePart(p, 2)
    const box = partBox(r)
    expect(box.min.toArray()).toEqual([100, 0, 200])
    expect(box.max.toArray()).toEqual([145, 1000, 270])
  })
})

describe('packSheets', () => {
  const SHEET: [number, number][] = [[2440, 1220]]

  it('fits two half sheets on one sheet, allowing for kerf', () => {
    const { sheets } = packSheets([[1218, 1220], [1218, 1220]], SHEET, 3)
    expect(sheets).toHaveLength(1)
    // 1219 + 3 + 1219 would not fit; 1218 + 3 + 1218 = 2439 does
    expect(packSheets([[1219, 1220], [1219, 1220]], SHEET, 3).sheets).toHaveLength(2)
  })

  it('rotates pieces to make them fit', () => {
    const { sheets, tooLarge } = packSheets([[1000, 2000]], SHEET, 3)
    expect(tooLarge).toEqual([])
    expect(sheets[0].pieces[0]).toMatchObject({ w: 2000, h: 1000, rotated: true })
  })

  it('never overlaps pieces', () => {
    const pieces: [number, number][] = Array.from({ length: 14 }, (_, i) => [300 + i * 37, 200 + ((i * 53) % 300)])
    const { sheets } = packSheets(pieces, SHEET, 3)
    expect(sheets.reduce((n, s) => n + s.pieces.length, 0)).toBe(14)
    for (const s of sheets) {
      for (const p of s.pieces) {
        expect(p.x + p.w).toBeLessThanOrEqual(s.length)
        expect(p.y + p.h).toBeLessThanOrEqual(s.width)
      }
      s.pieces.forEach((a, i) =>
        s.pieces.slice(i + 1).forEach((b) => {
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
          expect(overlap).toBe(false)
        }),
      )
    }
  })

  it('reports pieces larger than the sheet', () => {
    expect(packSheets([[3000, 500]], SHEET, 3).tooLarge).toEqual([[3000, 500]])
  })
})

describe('purchasePlan', () => {
  it('prices sheets per piece', () => {
    const sheetPart = part(800, { profileId: 'plywood-18', width: 600 })
    const plan = purchasePlan([sheetPart], [{ profileId: 'plywood-18', supplier: 'X', unit: 'st', price: 700 }], 3)
    expect(plan[0]).toMatchObject({ kind: 'sheet', cost: 700, supplier: 'X' })
  })
})

describe('snapOffset', () => {
  const box = (min: [number, number, number], max: [number, number, number]) => ({ min, max })
  const leg = box([0, 0, 0], [45, 450, 70])

  it('pulls a nearby face into contact', () => {
    // moving part ends 10 mm short of the leg's left face
    const moving = box([-1010, 100, 0], [-10, 145, 70])
    expect(snapOffset(moving, [leg], [true, false, false], 20)).toEqual([10, 0, 0])
  })

  it('ignores inactive axes and far-away parts', () => {
    const moving = box([-1010, 105, 5], [-10, 150, 75])
    expect(snapOffset(moving, [leg], [true, false, false], 20)[2]).toBe(0)
    const far = box([5000, 0, 0], [5045, 450, 70])
    expect(snapOffset(moving, [far], [true, true, true], 20)).toEqual([0, 0, 0])
  })
})

describe('grain direction', () => {
  const SHEET: [number, number][] = [[2440, 1220]]

  it('never turns a piece whose grain is locked', () => {
    // 1000 long x 2000 wide only fits turned; with grain along its length it can't
    expect(packSheets([[1000, 2000, 'length']], SHEET, 3).tooLarge).toEqual([[1000, 2000]])
    const across = packSheets([[1000, 2000, 'width']], SHEET, 3)
    expect(across.sheets[0].pieces[0]).toMatchObject({ w: 2000, h: 1000, rotated: true, grainLocked: true })
    const along = packSheets([[2000, 1000, 'length']], SHEET, 3)
    expect(along.sheets[0].pieces[0]).toMatchObject({ rotated: false, grainLocked: true })
  })

  it('can need more sheets than free nesting', () => {
    // Three 1100 x 700 parts: free, they stand side by side (3 x 700 across 2440);
    // with grain along their length they must lie (1100 across), two per sheet
    const free = packSheets(Array.from({ length: 3 }, () => [1100, 700] as [number, number]), SHEET, 3)
    expect(free.sheets).toHaveLength(1)
    const locked = packSheets(Array.from({ length: 3 }, () => [1100, 700, 'length'] as [number, number, 'length']), SHEET, 3)
    expect(locked.sheets).toHaveLength(2)
  })

  it('is noted in the cut list for plywood but not MDF', () => {
    const ply = part(600, { profileId: 'plywood-18', width: 400, grain: 'length' })
    const mdf = part(600, { profileId: 'mdf-19', width: 400, grain: 'length' })
    expect(cutList([ply])[0].notes).toEqual(['Fiberriktning längs delens längd'])
    expect(cutList([mdf])[0].notes).toEqual([])
  })
})

describe('own store sheet sizes', () => {
  const shelf: Part = { id: 'h', name: 'Hylla', profileId: 'plywood-18', length: 3000, width: 600, position: [0, 0, 0], rotation: [0, 0, 0] }

  it('replace the standard sizes for that material only', () => {
    const plywood = PROFILES.find((p) => p.id === 'plywood-18')!
    const osb = PROFILES.find((p) => p.category === 'osb')!
    expect(stockOptions(plywood, [], {}).sheets).toEqual([[2440, 1220]])
    expect(stockOptions(plywood, [], { plywood: [[3050, 1220]] }).sheets).toEqual([[3050, 1220]])
    expect(stockOptions(osb, [], { plywood: [[3050, 1220]] }).sheets).toEqual(osb.stockSheets)
  })

  it('are used by the shopping list: a 3000 mm shelf fits a 3050 × 1220 sheet', () => {
    const standard = purchasePlan([shelf], [], 3)[0]
    expect(standard.kind === 'sheet' && standard.tooLarge).toHaveLength(1)
    const mine = purchasePlan([shelf], [], 3, { plywood: [[3050, 1220]] })[0]
    expect(mine.kind === 'sheet' && mine.tooLarge).toEqual([])
    expect(mine.kind === 'sheet' && mine.sheetSize).toEqual([3050, 1220])
  })
})
