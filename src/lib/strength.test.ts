import { describe, expect, it } from 'vitest'
import { partBox, toAxisBox } from './geometry'
import { buildFrame } from './frame'
import { analyse, partWeightKg } from './strength'
import type { FrameLegs, Part, Vec3 } from './types'

/** A part whose bounding box starts at `min` */
function at(id: string, profileId: string, length: number, rotation: Part['rotation'], min: Vec3, width?: number): Part {
  const p: Part = { id, name: id, profileId, length, position: [0, 0, 0], rotation, ...(width ? { width } : {}) }
  const b = toAxisBox(partBox(p))
  return { ...p, position: [0, 1, 2].map((i) => min[i] - b.min[i]) as Vec3 }
}
const UP: Part['rotation'] = [0, 0, 1] // length along y
const ALONG_Z: Part['rotation'] = [0, 1, 0]

// Two 500 mm posts with a 1000 mm 45x95 board lying flat on top
const postL = at('postL', 'konstruktion-45x95', 500, UP, [0, 0, 0])
const postR = at('postR', 'konstruktion-45x95', 500, UP, [955, 0, 0])
const shelf = at('shelf', 'konstruktion-45x95', 1000, [0, 0, 0], [0, 500, 0])

describe('weight', () => {
  it('uses the bounding volume and a typical density', () => {
    // 1000 × 45 × 95 mm of C24 at 420 kg/m³
    expect(partWeightKg(shelf)).toBeCloseTo(1.7955, 3)
    // plus two 500 mm posts of the same profile
    expect(analyse([shelf, postL, postR], 'bokhylla').weightKg).toBeCloseTo(1.7955 * 2, 2)
  })
})

describe('sag and capacity', () => {
  it('matches the textbook formula for a shelf on two posts', () => {
    const a = analyse([postL, postR, shelf], 'bokhylla')
    const r = a.beams.find((b) => b.partId === 'shelf')!
    // Span between the post centres
    expect(r.span).toBeCloseTo(955, 0)
    // 5wL⁴/384EI with books (130 kg/m²) and creep: ≈ 0.30 mm (worked out by hand)
    expect(r.sag).toBeGreaterThan(0.27)
    expect(r.sag).toBeLessThan(0.33)
    expect(r.status).toBe('ok')
    expect(r.loadKg).toBeCloseTo(12.35, 1)
    expect(r.capacityKg).toBeGreaterThan(100)
  })

  it('flags a long thin plank', () => {
    const l = at('l', 'konstruktion-45x95', 500, UP, [0, 0, 0])
    const r = at('r', 'konstruktion-45x95', 500, UP, [2455, 0, 0])
    const plank = at('plank', 'hyvlat-21x95', 2500, [0, 0, 0], [0, 500, 0])
    const res = analyse([l, r, plank], 'bank').beams.find((b) => b.partId === 'plank')!
    expect(res.status).toBe('bad')
    expect(res.sag).toBeGreaterThan(res.sagLimit)
  })

  it('passes a shelf’s load down to the rails it rests on', () => {
    // Two rails running front–back, a 12 mm plywood shelf across them
    const railA = at('railA', 'konstruktion-45x95', 400, ALONG_Z, [0, 0, 0])
    const railB = at('railB', 'konstruktion-45x95', 400, ALONG_Z, [755, 0, 0])
    const legs = [
      at('l1', 'konstruktion-45x95', 600, UP, [0, -600, 0]),
      at('l2', 'konstruktion-45x95', 600, UP, [0, -600, 305]),
      at('l3', 'konstruktion-45x95', 600, UP, [755, -600, 0]),
      at('l4', 'konstruktion-45x95', 600, UP, [755, -600, 305]),
    ].map((p) => ({ ...p, position: [p.position[0], p.position[1] + 600, p.position[2]] as Vec3 }))
    const lift = (p: Part) => ({ ...p, position: [p.position[0], p.position[1] + 600, p.position[2]] as Vec3 })
    const sheet = lift(at('sheet', 'plywood-12', 850, [0, 0, 0], [0, 45, 0], 400))
    const a = analyse([...legs, lift(railA), lift(railB), sheet], 'bokhylla')
    const s = a.beams.find((b) => b.partId === 'sheet')!
    // 0.85 × 0.4 m² × 130 kg/m²
    expect(s.loadKg).toBeCloseTo(44.2, 1)
    const ra = a.beams.find((b) => b.partId === 'railA')!
    const rb = a.beams.find((b) => b.partId === 'railB')!
    expect(ra.loadKg + rb.loadKg).toBeCloseTo(44.2, 1)
  })

  it('lists a part that touches nothing below as floating', () => {
    const lone = at('lone', 'konstruktion-45x95', 1000, [0, 0, 0], [0, 800, 2000])
    expect(analyse([postL, postR, shelf, lone], 'bord').floating).toEqual(['lone'])
  })
})

describe('tipping', () => {
  it('a lone tall post tips at almost nothing', () => {
    const post = at('p', 'konstruktion-45x95', 2000, UP, [0, 0, 0])
    const t = analyse([post], 'bokhylla').tip!
    // 3.59 kg × 22.5 mm / 2000 mm
    expect(t.pushKg).toBeCloseTo(0.04, 2)
    expect(t.status).toBe('bad')
  })

  it('a low wide table is stable', () => {
    const t = analyse([postL, postR, shelf], 'bord').tip!
    expect(t.height).toBe(545)
  })
})

describe('wobble', () => {
  it('a frame of posts with no sheet wobbles both ways; a back panel braces one', () => {
    const a = analyse([postL, postR, shelf], 'bokhylla')
    expect(a.rack?.unbraced).toEqual(['vänster–höger', 'framåt–bakåt'])
    // A plywood back standing in the x–y plane (thickness along z)
    const back = at('back', 'plywood-9', 1000, [1, 0, 0], [0, 0, 95], 545)
    const b = toAxisBox(partBox(back))
    expect(b.max[2] - b.min[2]).toBe(9)
    expect(analyse([postL, postR, shelf, back], 'bokhylla').rack?.unbraced).toEqual(['framåt–bakåt'])
  })
})

describe('legs and posts', () => {
  it('a short post is limited by the wood itself, carrying half the shelf (hand-checked)', () => {
    const p = analyse([postL, postR, shelf], 'bokhylla').posts.find((x) => x.partId === 'postL')!
    // Half of (shelf 1.80 kg + books 12.35 kg) plus its own 0.90 kg
    expect(p.loadKg).toBeCloseTo(7.97, 1)
    // A·fc·0.6 = 53.9 kN, Euler 161 kN (E05 = 0.67·E, /1.3) → Rankine ≈ 40.4 kN ≈ 4117 kg
    expect(p.capacityKg).toBeGreaterThan(4050)
    expect(p.capacityKg).toBeLessThan(4180)
    expect(p.capacityBy).toBe('crushing')
    expect(p.status).toBe('ok')
  })

  it('a tall slender post is limited by buckling', () => {
    const l = at('l', 'konstruktion-45x45', 2400, UP, [0, 0, 0])
    const r = at('r', 'konstruktion-45x45', 2400, UP, [955, 0, 0])
    const top = at('top', 'konstruktion-45x95', 1000, [0, 0, 0], [0, 2400, 0])
    const p = analyse([l, r, top], 'forvaring').posts.find((x) => x.partId === 'l')!
    expect(p.capacityBy).toBe('buckling')
    // Euler 3.32 kN, crushing 25.5 kN → Rankine ≈ 2.94 kN ≈ 299 kg
    expect(p.capacityKg).toBeGreaterThan(290)
    expect(p.capacityKg).toBeLessThan(308)
  })
})

describe('own load per part', () => {
  it('replaces the preset on that part and flows down to the posts', () => {
    const heavy = { ...shelf, loadKg: 200 }
    const a = analyse([postL, postR, heavy], 'bokhylla')
    const r = a.beams.find((b) => b.partId === 'shelf')!
    expect(r.loadKg).toBeCloseTo(200, 0)
    expect(r.sag).toBeGreaterThan(r.sagLimit)
    const p = a.posts.find((x) => x.partId === 'postL')!
    // Half of 200 kg + half the shelf + the post itself
    expect(p.loadKg).toBeCloseTo(100 + 0.9 + 0.9, 0)
  })
})

describe('a frame under a sheet', () => {
  // Owner report 2026-11-21: joists right under the sheet showed as floating
  const sheet: Part = { id: 's', name: 'Skiva', profileId: 'plywood-18', length: 1800, width: 600, position: [0, 400, 0], rotation: [0, 0, 0] }
  const frame = { profileId: 'konstruktion-45x70', joists: 2, onEdge: true }
  const placements: (FrameLegs['placement'] | null)[] = [null, 'inside', 'outside', 'under', 'merged']
  for (const placement of placements)
    it(`nothing floats, joists and end rails pass their load on (legs: ${placement ?? 'none'})`, () => {
      const f = placement ? { ...frame, legs: { profileId: 'konstruktion-45x95', placement, height: 900 } } : frame
      const built = buildFrame(sheet, f)
      const parts = [built.sheet, ...built.parts]
      const a = analyse(parts, 'bord')
      if (placement) expect(a.floating.map((id) => parts.find((p) => p.id === id)!.name)).toEqual([])
      else {
        // Without legs the frame hangs in the air as a whole — only the long rails have nothing under them
        const floating = a.floating.map((id) => parts.find((p) => p.id === id)!.name)
        expect(floating.every((n) => /lång/i.test(n))).toBe(true)
      }
    })
})
