import { beforeEach, describe, expect, it } from 'vitest'
import { partBox, toAxisBox } from './geometry'
import { describeNotch, halfLap, notchAgainst, overlapsOf, rotateParts, rotatePartsInPlace, selectionOverlaps, toLocalBox, toWorldBox, trimAgainst, unionBox } from './joints'
import { useStore } from './store'
import type { Part } from './types'

const part = (id: string, profileId: string, length: number, extra: Partial<Part> = {}): Part => ({
  id,
  name: id,
  profileId,
  length,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  ...extra,
})
const box = (p: Part) => toAxisBox(partBox(p))

// A standing 45x70 leg: rotated about Z it spans x 0..45, y 0..450, z 0..70
const leg = part('leg', 'konstruktion-45x70', 450, { position: [45, 0, 0], rotation: [0, 0, 1] })

describe('local/world boxes', () => {
  it('round-trips through a rotated part', () => {
    const world = { min: [10, 100, 20] as [number, number, number], max: [30, 200, 60] as [number, number, number] }
    expect(box(leg)).toEqual({ min: [0, 0, 0], max: [45, 450, 70] })
    expect(toWorldBox(leg, toLocalBox(leg, world))).toEqual(world)
  })
})

describe('trimAgainst (butt joint)', () => {
  it('shortens a rail that runs into a leg at its far end', () => {
    // Rail along X from -500 to +500 at height 300, overlapping the leg's 45 mm
    const rail = part('rail', 'konstruktion-45x95', 1000, { position: [-955, 300, 0] })
    const [o] = overlapsOf(rail, [leg])
    expect(o.box).toEqual({ min: [0, 300, 0], max: [45, 345, 70] })
    expect(trimAgainst(rail, o.box)).toMatchObject({ length: 955, position: [-955, 300, 0] })
  })

  it('moves the start when the overlap is at the start', () => {
    const rail = part('rail', 'konstruktion-45x95', 1000, { position: [0, 300, 0] })
    const [o] = overlapsOf(rail, [leg])
    expect(trimAgainst(rail, o.box)).toMatchObject({ length: 955, position: [45, 300, 0] })
  })

  it('refuses when the other part crosses the middle', () => {
    const rail = part('rail', 'konstruktion-45x95', 1000, { position: [-500, 300, 0] })
    const [o] = overlapsOf(rail, [leg])
    expect(trimAgainst(rail, o.box)).toBeNull()
  })
})

describe('notches', () => {
  // Two 45x95 boards lying flat (95 wide in Z), crossing at the same height
  const a = part('a', 'konstruktion-45x95', 1000, { position: [0, 0, 0] })
  const b = part('b', 'konstruktion-45x95', 1000, { position: [500, 0, 600], rotation: [0, 1, 0] })

  it('cuts a dado the size of the overlap and then no longer reports it', () => {
    const [o] = overlapsOf(a, [b])
    const notched = notchAgainst(a, o.box, 'urtag', 'b')
    expect(notched.notches).toEqual([{ min: [500, 0, 0], max: [595, 45, 95], kind: 'urtag', withName: 'b' }])
    expect(overlapsOf(notched, [b])).toEqual([])
    expect(describeNotch(notched, notched.notches![0])).toBe(
      'Urtag 95 mm brett, genomgående, 500–595 mm från änden (mot b)',
    )
  })

  it('half lap removes half the depth from each part', () => {
    const [o] = overlapsOf(a, [b])
    const [na, nb] = halfLap(a, b, o.box)
    const depth = (p: Part) => p.notches![0].max[1] - p.notches![0].min[1]
    expect(depth(na)).toBe(22.5)
    expect(depth(nb)).toBe(22.5)
    expect(overlapsOf(na, [nb])).toEqual([])
    expect(describeNotch(na, na.notches![0])).toContain('22,5 mm djupt (tjocklek)')
  })
})

describe('rotateParts', () => {
  it('turns a group as one body, keeping its min corner', () => {
    const p1 = part('p1', 'konstruktion-45x45', 1000, { position: [100, 0, 0] })
    const p2 = part('p2', 'konstruktion-45x45', 1000, { position: [100, 0, 500] })
    const before = unionBox([p1, p2])!
    const turned = rotateParts([p1, p2], 1)
    const after = unionBox(turned)!
    expect(after.min).toEqual(before.min)
    // 1000 x 45 x 545 becomes 545 x 45 x 1000
    expect(after.max.map((v, i) => v - after.min[i])).toEqual([545, 45, 1000])
  })
})

describe('rotatePartsInPlace', () => {
  const p1 = part('p1', 'konstruktion-45x45', 1000, { position: [100, 0, 0] })
  const p2 = part('p2', 'konstruktion-45x45', 1000, { position: [100, 0, 500] })
  const centre = (ps: Part[]) => {
    const b = unionBox(ps)!
    return [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2)
  }

  it('keeps a selection on the floor when tipping it up', () => {
    const turned = rotatePartsInPlace([p1], 0, 1)
    expect(unionBox(turned)!.min[1]).toBe(0)
    const tipped = rotatePartsInPlace([p1], 2, 1)
    expect(unionBox(tipped)!.min[1]).toBe(0)
  })

  it('turns around the centre, so the selection stays in place', () => {
    const turned = rotatePartsInPlace([p1, p2], 1, 1)
    expect(centre(turned)).toEqual(centre([p1, p2]))
    const b = unionBox(turned)!
    expect(b.max.map((v, i) => v - b.min[i])).toEqual([545, 45, 1000])
  })

  it('one step back undoes one step forward, four steps are a full turn', () => {
    const back = rotatePartsInPlace(rotatePartsInPlace([p1, p2], 0, 1), 0, -1)
    expect(unionBox(back)).toEqual(unionBox([p1, p2]))
    let t = [p1, p2]
    for (let i = 0; i < 4; i++) t = rotatePartsInPlace(t, 2, 1)
    expect(unionBox(t)).toEqual(unionBox([p1, p2]))
  })
})

describe('store: selection and groups', () => {
  beforeEach(() => useStore.getState().newProject())

  it('groups parts, selects the whole group on tap, and undoes', () => {
    const s = useStore.getState
    s().addPart('konstruktion-45x70')
    s().addPart('konstruktion-45x70')
    s().addPart('konstruktion-45x95')
    const [p1, p2, p3] = s().project.parts
    s().select([p1.id, p2.id])
    s().groupSelection('Ben')
    expect(s().project.groups.map((g) => g.name)).toEqual(['Ben'])

    s().tapPart(p1.id)
    expect(s().selection.sort()).toEqual([p1.id, p2.id].sort())
    s().tapPart(p3.id, true)
    expect(s().selection).toHaveLength(3)

    s().moveSelection([100, 0, 0])
    expect(s().project.parts.every((p, i) => p.position[0] === 100 + [0, 0, 0][i])).toBe(true)

    s().undo()
    expect(s().project.parts.map((p) => p.position[0])).toEqual([0, 0, 0])
    s().undo()
    expect(s().project.groups).toEqual([])
  })

  it('dissolves a group that drops below two parts', () => {
    const s = useStore.getState
    s().addPart('konstruktion-45x70')
    s().addPart('konstruktion-45x70')
    const [p1, p2] = s().project.parts
    s().select([p1.id, p2.id])
    s().groupSelection('Par')
    s().select([p2.id])
    s().removeSelection()
    expect(s().project.groups).toEqual([])
    expect(s().project.parts[0].groupId).toBeUndefined()
  })

  it('duplicates a group into a new group', () => {
    const s = useStore.getState
    s().addPart('konstruktion-45x70')
    s().addPart('konstruktion-45x70')
    s().select(s().project.parts.map((p) => p.id))
    s().groupSelection('Ben')
    s().duplicateSelection()
    expect(s().project.groups.map((g) => g.name)).toEqual(['Ben', 'Ben (kopia)'])
    expect(s().project.parts).toHaveLength(4)
  })
})

describe('store: modes', () => {
  beforeEach(() => useStore.getState().newProject())

  it('Bygg adds each tapped group to the selection; Redigera picks one part', () => {
    const s = useStore.getState
    s().setMode('skissa')
    for (let i = 0; i < 3; i++) s().addPart('konstruktion-45x70')
    const [a, b, c] = s().project.parts
    s().select([a.id, b.id])
    s().groupSelection('Ben')
    s().clearSelection()

    s().pickPart(a.id) // whole group
    s().pickPart(c.id) // added
    expect(s().selection.sort()).toEqual([a.id, b.id, c.id].sort())
    s().pickPart(c.id) // toggled off again
    expect(s().selection.sort()).toEqual([a.id, b.id].sort())

    s().setMode('detaljer')
    s().pickPart(b.id) // just this part, even though it's in a group
    expect(s().selection).toEqual([b.id])
  })

  it('moves the selection next to a tapped board', () => {
    const s = useStore.getState
    s().setMode('skissa')
    s().addPart('konstruktion-45x95')
    s().addPart('konstruktion-45x95')
    const [sill, other] = s().project.parts
    s().updatePart(sill.id, { length: 1200, position: [0, 0, 0] })
    s().select([other.id])
    s().setMoveMode(true)
    // Tap the top of the sill near its end
    s().moveTap({ partId: sill.id, hit: [1180, 45, 40], normal: [0, 1, 0] })
    const moved = s().project.parts.find((p) => p.id === other.id)!
    expect(moved.position[1]).toBe(45)
    expect(moved.position[0] + moved.length).toBe(1200)
  })
})

describe('selectionOverlaps', () => {
  const a = part('a', 'konstruktion-45x95', 1000)
  const b = part('b', 'konstruktion-45x95', 1000, { position: [500, 0, 0] }) // overlaps a
  const c = part('c', 'konstruktion-45x95', 1000, { position: [1200, 0, 0] }) // overlaps b
  const far = part('far', 'konstruktion-45x95', 1000, { position: [0, 0, 3000] })

  it('finds collisions with parts outside the selection and inside it, each pair once', () => {
    const pairs = (sel: Part[]) => selectionOverlaps(sel, [a, b, c, far]).length
    expect(pairs([a])).toBe(1) // a–b
    expect(pairs([a, b])).toBe(2) // a–b (inside the group) and b–c
    expect(pairs([a, b, c])).toBe(2) // a–b, b–c
    expect(pairs([far])).toBe(0)
  })
})
