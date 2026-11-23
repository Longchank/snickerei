import { describe, expect, it } from 'vitest'
import { runChecks } from './checks'
import { purchasePlan } from './cutlist'
import { partBox, toAxisBox } from './geometry'
import { screwJoints } from './screws'
import { analyse } from './strength'
import type { Part, Vec3 } from './types'

function at(id: string, length: number, rotation: Part['rotation'], min: Vec3, profileId = 'konstruktion-45x95'): Part {
  const p: Part = { id, name: id, profileId, length, position: [0, 0, 0], rotation }
  const b = toAxisBox(partBox(p))
  return { ...p, position: [0, 1, 2].map((i) => min[i] - b.min[i]) as Vec3 }
}
const check = (parts: Part[]) => runChecks(parts, analyse(parts, 'forvaring'), screwJoints(parts, {}, { all: true }), purchasePlan(parts, [], 3))

describe('runChecks', () => {
  it('finds a collision, with a marker inside the overlap and a fix in Bygg', () => {
    const a = at('A', 1000, [0, 0, 0], [0, 0, 0])
    const b = at('B', 1000, [0, 0, 0], [500, 0, 50])
    const k = check([a, b]).find((i) => i.id.startsWith('krock'))!
    expect(k.severity).toBe('bad')
    expect(k.partIds.sort()).toEqual(['A', 'B'])
    expect(k.fix).toBe('bygg')
    expect(k.at![0]).toBeGreaterThan(500)
  })

  it('finds a part floating in the air', () => {
    const issues = check([at('Golv', 1000, [0, 0, 0], [0, 0, 0]), at('Flyg', 600, [0, 0, 0], [0, 800, 2000])])
    expect(issues.some((i) => i.id === 'svavar:Flyg')).toBe(true)
  })

  it('flags a board longer than the store sells, and puts bad issues first', () => {
    const issues = check([at('Lång', 7000, [0, 0, 0], [0, 0, 0])])
    const long = issues.find((i) => i.id.startsWith('lang'))!
    expect(long.partIds).toEqual(['Lång'])
    expect(long.fix).toBe('detaljer')
    expect(issues[0].severity).toBe('bad')
  })

  it('a clean, simple build has no bad issues', () => {
    const issues = check([at('A', 1000, [0, 0, 0], [0, 0, 0])])
    expect(issues.filter((i) => i.severity === 'bad')).toEqual([])
  })
})
