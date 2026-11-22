import { describe, expect, it } from 'vitest'
import { partBox, toAxisBox } from './geometry'
import { chooseScrew, pilotBit, screwJoints, screwName, screwSections, screwTotals } from './screws'
import type { Part, Vec3 } from './types'

function at(id: string, profileId: string, length: number, rotation: Part['rotation'], min: Vec3, width?: number): Part {
  const p: Part = { id, name: id, profileId, length, position: [0, 0, 0], rotation, ...(width ? { width } : {}) }
  const b = toAxisBox(partBox(p))
  return { ...p, position: [0, 1, 2].map((i) => min[i] - b.min[i]) as Vec3 }
}
const UP: Part['rotation'] = [0, 0, 1]

describe('chooseScrew', () => {
  it('follows the 2.5 × rule and steps up the diameter with the thickness', () => {
    expect(screwName(chooseScrew(22, 45, false, false, false).screw)).toBe('4,5 × 60 träskruv')
    const s45 = chooseScrew(45, 95, false, false, false).screw
    expect(s45.length).toBeGreaterThanOrEqual(112)
    expect(s45.d).toBe(6)
  })

  it('goes longer into end grain, never through the far side, and flags a short screw', () => {
    const end = chooseScrew(45, 1000, true, false, false).screw
    expect(end.length).toBeGreaterThanOrEqual(135)
    const thin = chooseScrew(45, 45, false, false, false)
    expect(thin.screw.length).toBeLessThanOrEqual(85)
    expect(thin.short).toBe(true)
  })

  it('uses sheet screws for sheets and stainless for pressure-treated wood', () => {
    const s = chooseScrew(12, 70, false, true, false).screw
    expect(s.type).toBe('skivskruv')
    expect(s.length).toBeGreaterThanOrEqual(30)
    expect(chooseScrew(28, 45, false, false, true).screw.outdoor).toBe(true)
  })
})

describe('pilotBit', () => {
  it('is about the core of the screw', () => {
    expect(pilotBit(5, false)).toBe(3)
    expect(pilotBit(4, false)).toBe(2.5)
    expect(pilotBit(5, true)).toBe(4)
  })
})

describe('screwJoints', () => {
  // A sill with a post standing on its end, and a rail butting into the post's side
  const sill = at('sill', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 0, 0])
  const post = at('post', 'konstruktion-45x95', 1000, UP, [1155, 45, 0])
  const rail = at('rail', 'konstruktion-45x95', 600, [0, 0, 0], [555, 500, 0])

  it('screws through the sill up into the post’s end grain, near the sill’s end → pre-drill', () => {
    const [j] = screwJoints([sill, post])
    expect(j.through.id).toBe('sill')
    expect(j.into.id).toBe('post')
    expect(j.endGrain).toBe(true)
    expect(j.screw.length).toBeGreaterThanOrEqual(135)
    expect(j.count).toBe(2)
    expect(j.predrill?.bit).toBeGreaterThan(0)
  })

  it('screws through the post into the rail’s end', () => {
    const joints = screwJoints([post, rail])
    expect(joints).toHaveLength(1)
    expect(joints[0].through.id).toBe('post')
    expect(joints[0].into.id).toBe('rail')
    expect(joints[0].endGrain).toBe(true)
  })

  it('a sheet on joists: sheet screws through the sheet, c/c ~300', () => {
    const j1 = at('j1', 'konstruktion-45x70', 1000, [0, 1, 0], [0, 0, 0])
    const sheet = at('s', 'plywood-12', 1000, [0, 1, 0], [0, 45, 0], 600)
    const [j] = screwJoints([j1, sheet])
    expect(j.through.id).toBe('s')
    expect(j.screw.type).toBe('skivskruv')
    expect(j.count).toBe(5) // ceil(1000 / 300) + 1
  })

  it('ignores parts that only meet at an edge, overlap, or stand apart', () => {
    const far = at('far', 'konstruktion-45x95', 500, [0, 0, 0], [0, 0, 500])
    const inside = at('in', 'konstruktion-45x95', 500, [0, 0, 0], [100, 10, 10])
    expect(screwJoints([sill, far])).toEqual([])
    expect(screwJoints([sill, inside])).toEqual([])
  })

  it('totals screws per size with about 10 % spare', () => {
    const totals = screwTotals(screwJoints([sill, post, rail]))
    const sum = totals.reduce((s, t) => s + t.count, 0)
    expect(sum).toBe(4)
    for (const t of totals) expect(t.toBuy).toBeGreaterThanOrEqual(t.count * 1.1)
  })
})

describe('thick pieces', () => {
  it('a 95 mm leg into a rail end gets a sensible screw, not a 280', () => {
    const s = chooseScrew(95, 1600, true, false, false)
    expect(s.screw.length).toBeLessThanOrEqual(240)
    expect(s.short).toBe(false)
  })
})

describe('screw positions', () => {
  it('sit on the outer face of the part screwed through, spread over the contact', () => {
    const sill = at('sill', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 0, 0])
    const post = at('post', 'konstruktion-45x95', 1000, UP, [1155, 45, 0])
    const [j] = screwJoints([sill, post])
    // Through the sill from below (its underside, y = 0), screwing up into the post
    expect(j.dir).toEqual([0, 1, 0])
    expect(j.points).toHaveLength(2)
    for (const p of j.points) expect(p[1]).toBe(0)
    // Two screws sit diagonally: spread along the 95 mm side (23.75 / 71.25)
    // and a quarter in from each side across the 45 mm one (1166.25 / 1188.75)
    const pts = [...j.points].sort((a, b) => a[2] - b[2])
    expect(pts.map((p) => p[2])).toEqual([23.75, 71.25])
    expect(pts.map((p) => p[0])).toEqual([1166.25, 1188.75])
  })

  it('a sheet on a joist gets a row along the joist, 40 mm in from the ends', () => {
    const j1 = at('j1', 'konstruktion-45x70', 1000, [0, 1, 0], [0, 0, 0])
    const sheet = at('s', 'plywood-12', 1000, [0, 1, 0], [0, 45, 0], 600)
    const [j] = screwJoints([j1, sheet])
    expect(j.dir).toEqual([0, -1, 0])
    const zs = j.points.map((p) => p[2])
    expect(Math.min(...zs)).toBe(40)
    expect(Math.max(...zs)).toBe(960)
    expect(j.points.every((p) => p[1] === 57)).toBe(true) // the sheet's top
  })
})

describe('screwSections', () => {
  it('groups joints in build order: each group, then where groups are joined, then loose parts', () => {
    const sill = { ...at('sill', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 0, 0]), groupId: 'ram' }
    const rail = { ...at('rail', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 45, 0]), groupId: 'ram' } // lies on the sill
    const post = { ...at('post', 'konstruktion-45x95', 1000, UP, [1155, 90, 0]), groupId: 'ben' } // stands on the rail
    const loose1 = at('l1', 'konstruktion-45x95', 500, [0, 0, 0], [0, 0, 2000])
    const loose2 = at('l2', 'konstruktion-45x95', 500, [0, 0, 0], [0, 45, 2000])
    const sections = screwSections(screwJoints([sill, rail, post, loose1, loose2]), [
      { id: 'ram', name: 'Ram' },
      { id: 'ben', name: 'Ben' },
    ])
    expect(sections.map((s) => [s.title, s.joints.length])).toEqual([
      ['Ram', 1],
      ['Montering: Ben + Ram', 1],
      ['Lösa delar', 1],
    ])
  })
})

describe('blocked access', () => {
  it('flags a joint whose screw side is covered by another part', () => {
    const sill = at('Syll', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 0, 0])
    const rail = at('Regel', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 45, 0])
    const post = at('Ben', 'konstruktion-45x95', 1000, UP, [1155, 90, 0])
    const joints = screwJoints([sill, rail, post])
    const railPost = joints.find((j) => j.into.id === 'Ben')!
    // Screwing up through the rail is impossible: the sill lies under it
    expect(railPost.through.id).toBe('Regel')
    expect(railPost.blockedBy).toBe('Syll')
    // Rail onto sill: screws go in from the rail's top, which is free there
    const railSill = joints.find((j) => [j.through.id, j.into.id].sort().join() === 'Regel,Syll')!
    expect(railSill.blockedBy).toBeNull()
  })
})

describe('screw layout and hand-set counts', () => {
  const sill = at('sill', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 0, 0])
  const post = at('post', 'konstruktion-45x95', 1000, UP, [1155, 45, 0])

  it('a short row zigzags across the contact', () => {
    const [j] = screwJoints([sill, post], { 'sill|post': { count: 4 } })
    const across = j.points.map((p) => p[0])
    expect(new Set(across).size).toBe(2) // alternating sides
    expect(across[0]).not.toBe(across[1])
    expect(across[0]).toBe(across[2])
  })

  it('a hand-set count replaces the suggestion and keeps it for "back to suggestion"', () => {
    const [auto] = screwJoints([sill, post])
    const [hand] = screwJoints([sill, post], { [auto.key]: { count: 3 } })
    expect(auto.key).toBe('sill|post')
    expect(hand.count).toBe(3)
    expect(hand.points).toHaveLength(3)
    expect(hand.suggested).toBe(auto.count)
    expect(screwTotals([hand]).reduce((n, t) => n + t.count, 0)).toBe(3)
  })
})

describe('hand-set screw count in the store', () => {
  it('is saved with the project, undoable, and null goes back to the suggestion', async () => {
    const { useStore } = await import('./store')
    const s = () => useStore.getState()
    s().newProject()
    s().setScrewCount('a|b', 3)
    expect(s().project.screwEdits).toEqual({ 'a|b': { count: 3 } })
    s().setScrewCount('a|b', 99)
    expect(s().project.screwEdits).toEqual({ 'a|b': { count: 20 } }) // capped
    s().undo()
    expect(s().project.screwEdits).toEqual({ 'a|b': { count: 3 } })
    s().setScrewCount('a|b', null)
    expect(s().project.screwEdits).toBeUndefined()
  })
})

describe('blocked access follows the build order', () => {
  // A rail screwed up into a leg (both in group "ram"), with a sill under the
  // rail that belongs to another group, attached later
  const rail = (g?: string) => ({ ...at('Regel', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 45, 0]), groupId: g })
  const sill = (g?: string) => ({ ...at('Syll', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 0, 0]), groupId: g })
  const leg = (g?: string) => ({ ...at('Ben', 'konstruktion-45x95', 1000, UP, [1155, 90, 0]), groupId: g })
  const railLeg = (parts: Part[]) => screwJoints(parts).find((j) => j.into.id === 'Ben')!

  it('inside a group, a part from a group added later does not block', () => {
    expect(railLeg([sill('golv'), rail('ram'), leg('ram')]).blockedBy).toBeNull()
  })
  it('a part of the same group (already there) still blocks', () => {
    expect(railLeg([sill('ram'), rail('ram'), leg('ram')]).blockedBy).toBe('Syll')
  })
  it('without groups everything is there, as before', () => {
    expect(railLeg([sill(), rail(), leg()]).blockedBy).toBe('Syll')
  })
})

describe('editing screws by hand (CRUD)', () => {
  const sill = at('sill', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 0, 0])
  const post = at('post', 'konstruktion-45x95', 1000, UP, [1155, 45, 0])
  const far = at('far', 'konstruktion-45x95', 600, [0, 0, 0], [0, 0, 300])

  it('a joint switched off has no screws, no dots and no place in the totals', () => {
    const [j] = screwJoints([sill, post], { 'sill|post': { off: true } })
    expect(j.off).toBe(true)
    expect(j.count).toBe(0)
    expect(j.points).toEqual([])
    expect(screwTotals([j])).toEqual([])
  })

  it('a chosen size replaces the suggestion', () => {
    const [j] = screwJoints([sill, post], { 'sill|post': { d: 5, length: 100 } })
    expect(j.screw.d).toBe(5)
    expect(j.screw.length).toBe(100)
    expect(j.custom).toBe(true)
  })

  it('a joint added by hand between parts that do not touch gets screws', () => {
    const joints = screwJoints([sill, far], { 'sill|far': { manual: true, count: 2 } })
    expect(joints).toHaveLength(1)
    expect(joints[0].manual).toBe(true)
    expect(joints[0].count).toBe(2)
    expect(joints[0].points).toHaveLength(2)
    // A hand-added joint whose part was removed just disappears
    expect(screwJoints([sill], { 'sill|far': { manual: true } })).toEqual([])
  })

  it('old saved counts are read as edits', async () => {
    const { normalizeProject } = await import('./store')
    const p = normalizeProject({ parts: [], screwCounts: { 'a|b': 4 } } as never)
    expect(p.screwEdits).toEqual({ 'a|b': { count: 4 } })
  })
})
