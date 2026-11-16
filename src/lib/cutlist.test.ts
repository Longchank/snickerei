import { describe, expect, it } from 'vitest'
import { boardPrice, cutList, packCuts } from './cutlist'
import { partBox, rotatePart } from './geometry'
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
  it('packs cuts with kerf and shrinks boards to the shortest stock length', () => {
    const { boards, tooLong } = packCuts([1800, 1800, 900], [3000, 3600, 4200], 3)
    expect(tooLong).toEqual([])
    // 1800 + 3 + 1800 = 3603 > 3600, so the pair needs a 4200;
    // adding the 900 would need 4506, so it goes on its own 3000
    expect(boards.map((b) => [b.length, b.cuts])).toEqual([
      [4200, [1800, 1800]],
      [3000, [900]],
    ])
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

describe('boardPrice', () => {
  it('picks the cheapest of per-metre and per-piece prices', () => {
    const prices = [
      { profileId: 'p', supplier: 'A', unit: 'lm' as const, price: 30 },
      { profileId: 'p', supplier: 'B', unit: 'st' as const, length: 3000, price: 80 },
    ]
    expect(boardPrice('p', 3000, prices)).toEqual({ price: 80, supplier: 'B' })
    expect(boardPrice('p', 3600, prices)).toEqual({ price: 108, supplier: 'A' })
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
