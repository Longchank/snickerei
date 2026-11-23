import { describe, expect, it } from 'vitest'
import { partBox, toAxisBox } from './geometry'
import { chooseScrew, countJointEdit, flipJointEdit, jointStep, pilotBit, pointOffsets, planJoint, screwJoints, screwName, screwSections, screwTotals } from './screws'
import type { Part, Vec3 } from './types'

function at(id: string, profileId: string, length: number, rotation: Part['rotation'], min: Vec3, width?: number): Part {
  const p: Part = { id, name: id, profileId, length, position: [0, 0, 0], rotation, ...(width ? { width } : {}) }
  const b = toAxisBox(partBox(p))
  return { ...p, position: [0, 1, 2].map((i) => min[i] - b.min[i]) as Vec3 }
}
const UP: Part['rotation'] = [0, 0, 1]

describe('chooseScrew', () => {
  it('is about twice as long as what is fastened, at least 30 mm (Svenskt Trä)', () => {
    // Svenskt Trä's table: 12 → min 28, 19 → 40, 34 → 70, 45 → 80
    expect(chooseScrew(12, 45, false, false, false).screw.length).toBe(30)
    expect(chooseScrew(19, 45, false, false, false).screw.length).toBe(40)
    expect(screwName(chooseScrew(22, 45, false, false, false).screw)).toBe('4,5 × 45 träskruv')
    expect(chooseScrew(34, 95, false, false, false).screw.length).toBe(70)
    const s45 = chooseScrew(45, 95, false, false, false).screw
    expect(s45.length).toBe(90)
    expect(s45.d).toBe(5)
  })

  it('goes longer into end grain, never through the far side, and flags a short screw', () => {
    const end = chooseScrew(45, 1000, true, false, false).screw
    expect(end.length).toBeGreaterThanOrEqual(135)
    // 45 into 45: 80 mm stays inside and is Svenskt Trä's minimum — not short
    const same = chooseScrew(45, 45, false, false, false)
    expect(same.screw.length).toBe(80)
    expect(same.short).toBe(false)
    const thin = chooseScrew(45, 22, false, false, false)
    expect(thin.screw.length).toBeLessThanOrEqual(62)
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

describe('screws placed one by one in 3D', () => {
  const sill = at('sill', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 0, 0])
  const post = at('post', 'konstruktion-45x95', 1000, UP, [1155, 45, 0])

  it('hand-placed spots set the count, follow the part screwed through and stay on the contact', () => {
    const [auto] = screwJoints([sill, post])
    // Offsets from the sill's box corner (0,0,0): one inside, one far outside the contact
    const edits = { [auto.key]: { points: [[1170, 0, 30], [5000, 0, 500]] as Vec3[] } }
    const [j] = screwJoints([sill, post], edits)
    expect(j.count).toBe(2)
    expect(j.custom).toBe(true)
    expect(j.points[0]).toEqual([1170, 0, 30])
    // Clamped onto the contact (x 1155..1200, z 0..95)
    expect(j.points[1]).toEqual([1200, 0, 95])
    // Move both parts 100 mm along z: the screws come along
    const shift = (p: Part): Part => ({ ...p, position: [p.position[0], p.position[1], p.position[2] + 100] })
    const [moved] = screwJoints([shift(sill), shift(post)], edits)
    expect(moved.points[0]).toEqual([1170, 0, 130])
  })
})

describe('planJoint ("Ny fog": tap a face)', () => {
  // A 22 mm sheet strip lying on a rail, both along x
  const rail = at('rail', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 0, 0])
  const top = at('top', 'plywood-18', 1200, [0, 0, 0], [0, 45, 0], 95)
  const up: Vec3 = [0, 1, 0]

  it('finds the part behind the tapped face and puts the screws at the tap, inside the face', () => {
    const plan = planJoint([rail, top], 'top', [1100, 63, 50], up)!
    expect(plan.into.id).toBe('rail')
    expect(plan.anchor).toBe('tap')
    expect((plan.points[0][0] + plan.points[1][0]) / 2).toBe(1100)
    const atEnd = planJoint([rail, top], 'top', [1195, 63, 50], up)!
    expect(Math.max(...atEnd.points.map((p) => p[0]))).toBe(1160)
    expect(plan.dir).toEqual([0, -1, 0])
    expect(plan.points).toHaveLength(2)
    expect(plan.points.every((p) => p[1] === 63)).toBe(true)
    expect(Math.max(...plan.points.map((p) => p[0]))).toBeLessThanOrEqual(1200 - 39)
    expect(plan.t).toBe(18)
    expect(plan.depth).toBe(45)
  })

  it('start / centre / end, count and the other diagonal can be chosen', () => {
    const start = planJoint([rail, top], 'top', [1100, 63, 50], up, { anchor: 'start', count: 3 })!
    expect(start.points).toHaveLength(3)
    expect(Math.min(...start.points.map((p) => p[0]))).toBeLessThan(100)
    const a = planJoint([rail, top], 'top', [600, 63, 50], up)!
    const b = planJoint([rail, top], 'top', [600, 63, 50], up, { flip: true })!
    expect(a.anchor).toBe('tap')
    expect(a.points[0][2]).toBe(b.points[1][2]) // mirrored across
    expect(a.points[0][2]).not.toBe(b.points[0][2])
  })

  it('says how far the screw bites, and when it would poke out', () => {
    const ok = planJoint([rail, top], 'top', [600, 63, 50], up)!
    expect(ok.bite).toBe(ok.screw.length - 18)
    expect(ok.poke).toBe(false)
    const long = planJoint([rail, top], 'top', [600, 63, 50], up, { d: 6, length: 100 })!
    expect(long.poke).toBe(true) // 100 − 18 = 82 > 45
  })

  it('nothing behind the face: no joint', () => {
    expect(planJoint([rail, top], 'top', [600, 45, 50], [0, -1, 0])).toBeNull()
  })
})

describe('editing a joint (count, diagonal)', () => {
  // A 45x95 lying across another: a short, square contact
  const sill = at('sill', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 0, 0])
  const rail = at('rail', 'konstruktion-45x95', 600, [0, 1, 0], [300, 45, -200])
  const joint = (edits = {}) => screwJoints([sill, rail], edits)[0]

  it('flips the zigzag of spread screws, and mirrors hand-placed ones', () => {
    const j = joint()
    expect(j.count).toBe(2)
    const flipped = joint({ [j.key]: flipJointEdit(j) })
    expect(flipped.flip).toBe(true)
    expect(flipped.points[0]).not.toEqual(j.points[0])
    const placed = joint({ [j.key]: { points: [pointOffsets(j)[0]] } })
    const mirrored = joint({ [j.key]: flipJointEdit(placed) })
    const [, va] = j.axes
    expect(mirrored.points[0][va]).toBeCloseTo(j.area.min[va] + j.area.max[va] - placed.points[0][va])
  })

  it('changes the count: spread ones re-spread, hand-placed ones keep their spots', () => {
    const j = joint()
    expect(countJointEdit(j, 3)).toEqual({ count: 3, points: undefined })
    const placed = joint({ [j.key]: { points: [pointOffsets(j)[0]] } })
    const more = countJointEdit(placed, 2).points!
    expect(more).toHaveLength(2)
    expect(more[0]).toEqual(pointOffsets(placed)[0])
    expect(countJointEdit(placed, 0).points).toHaveLength(1)
  })
})

describe('jointStep', () => {
  it("a joint inside a group belongs to that group's step, the rest to Montering", () => {
    const sill = { ...at('sill', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 0, 0]), groupId: 'ram' }
    const rail = { ...at('rail', 'konstruktion-45x95', 1200, [0, 0, 0], [0, 45, 0]), groupId: 'ram' }
    const top = { ...at('top', 'plywood-18', 1200, [0, 0, 0], [0, 90, 0], 95), groupId: 'skiva' }
    const steps = screwJoints([sill, rail, top]).map((j) => `${j.through.id}-${j.into.id}:${jointStep(j)}`).sort()
    expect(steps).toEqual(['sill-rail:ram', 'top-rail:montering'])
  })
})
