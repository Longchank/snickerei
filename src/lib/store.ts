import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { EXAMPLE_PRICES, getProfile } from './catalog'
import { useMemo } from 'react'
import { partBox, rotatePart } from './geometry'
import { cornerButt, cornerMiter, findCornerPartner } from './corner'
import { miterCorner, ripPart } from './cuts'
import { halfLap, moveParts, notchAgainst, overlapsOf, rotateParts, toLocalBox, trimAgainst, unionBox } from './joints'
import { mergePrices, supplierEntries } from './prices'
import { describePlacement, floorTapTarget, placementOptions, placeOnFloor, type Placement } from './place'
import { DEFAULT_SNAP_TYPES } from './snap'
import type {
  EndCut,
  Group,
  MeasurePoint,
  Measurement,
  Part,
  PriceEntry,
  Project,
  Settings,
  SupplierPriceFile,
  Vec3,
} from './types'

const HISTORY_LIMIT = 100

/** What undo/redo restores */
type Snapshot = Pick<Project, 'parts' | 'groups'>

interface State {
  project: Project
  /** Selected part ids */
  selection: string[]
  /** Bumped on every pick (even of the same part), so the UI can react to it */
  pickCount: number
  /** Phone: taps add to / remove from the selection instead of replacing it */
  multiSelect: boolean
  /** Measuring tool on: taps pick points instead of selecting */
  measureMode: boolean
  /** Placing boards of this profile: taps on the model place one each */
  placeProfile: string | null
  /** What the last placement did, for the banner */
  placeNote: string | null
  /** Other ways the last placed board could go, to cycle through */
  placeChoice: { partId: string; options: Placement[]; index: number } | null
  /** First point of a measurement in progress */
  pendingPoint: MeasurePoint | null
  /** Snap alternatives for the most recent tap, which the user can cycle through */
  snapChoice: SnapChoice | null
  /** Desktop: where a click would land right now (snap preview) */
  measureHover: MeasurePoint | null
  settings: Settings
  /** Hand-entered prices (supplier "Egen") */
  ownPrices: PriceEntry[]
  useExamplePrices: boolean
  /** Price files loaded from public/prices/ — not persisted, reloaded at start */
  supplierFiles: SupplierPriceFile[]
  /** Suppliers whose prices are switched off */
  disabledSuppliers: string[]
  past: Snapshot[]
  future: Snapshot[]

  addPart: (profileId: string) => void
  updatePart: (id: string, patch: Partial<Omit<Part, 'id'>>) => void

  /** Tap on a part in 3D: selects its whole group; additive toggles */
  tapPart: (id: string, additive?: boolean) => void
  /** Select exactly these parts (e.g. from the parts list) */
  select: (ids: string[]) => void
  clearSelection: () => void
  setMultiSelect: (on: boolean) => void
  setMeasureMode: (on: boolean) => void
  setPlaceProfile: (profileId: string | null) => void
  /** A tap while placing: on a part's face (with outward normal) or the floor */
  /** `margin`: how far (mm) from a part a floor tap still counts as a tap on it */
  placeTap: (
    target: { partId: string; hit: Vec3; normal: Vec3; missed?: boolean } | { floor: Vec3; margin?: number },
  ) => void
  /** Put the last placed board the next way instead */
  cyclePlacement: () => void
  /** A tap in measuring mode: first tap starts, second finishes a measurement.
   * `options` are the snap alternatives for this tap, best (= p) first. */
  measureTap: (p: MeasurePoint, options?: MeasurePoint[]) => void
  /** Use the next snap alternative for the most recent tap */
  cycleSnap: () => void
  setMeasureHover: (p: MeasurePoint | null) => void
  removeMeasurement: (id: string) => void
  clearMeasurements: () => void

  moveSelection: (d: Vec3) => void
  rotateSelection: (axis: 0 | 1 | 2) => void
  duplicateSelection: () => void
  removeSelection: () => void
  groupSelection: (name: string) => void
  ungroup: (groupId: string) => void
  renameGroup: (groupId: string, name: string) => void

  /** Joints between a part and one it overlaps */
  trimTo: (partId: string, otherId: string) => void
  notchWith: (partId: string, otherId: string) => void
  halfLapWith: (partId: string, otherId: string) => void
  removeNotch: (partId: string, index: number) => void
  /** Angled end cut; end 0 = start, 1 = end; null = square */
  setEndCut: (partId: string, end: 0 | 1, cut: EndCut | null) => void
  miterWith: (partId: string, otherId: string) => void
  /** Rip the part lengthwise at an angle into two (French cleat) */
  frenchCleat: (partId: string, angle: number) => void

  undo: () => void
  redo: () => void
  setProjectName: (name: string) => void
  newProject: () => void
  loadProject: (project: Project) => void
  setSettings: (patch: Partial<Settings>) => void
  /** kr per running metre for boards, kr per sheet for sheets */
  setOwnPrice: (profileId: string, price: number | null) => void
  setUseExamplePrices: (v: boolean) => void
  addSupplierFile: (file: SupplierPriceFile) => void
  setSupplierEnabled: (supplier: string, enabled: boolean) => void
}

export interface SnapChoice {
  options: MeasurePoint[]
  index: number
  /** The pending first point, or point b of a finished measurement */
  target: 'pending' | { id: string }
}

const DEFAULT_SETTINGS: Settings = {
  snap: 5,
  kerf: 3,
  showDimensions: true,
  snapToParts: true,
  snapTypes: DEFAULT_SNAP_TYPES,
}

const uid = () => Math.random().toString(36).slice(2, 10)

const emptyProject = (): Project => ({ name: 'Nytt projekt', parts: [], groups: [], measurements: [] })

/** Older saves and imported files may lack newer fields. */
export function normalizeProject(p: Partial<Project> | undefined): Project {
  return {
    name: p?.name ?? 'Nytt projekt',
    parts: p?.parts ?? [],
    groups: p?.groups ?? [],
    measurements: p?.measurements ?? [],
  }
}

/** Drop groups with fewer than two parts (a group of one is just a part). */
function pruneGroups(snap: Snapshot): Snapshot {
  const counts = new Map<string, number>()
  snap.parts.forEach((p) => p.groupId && counts.set(p.groupId, (counts.get(p.groupId) ?? 0) + 1))
  const keep = new Set([...counts].filter(([, n]) => n >= 2).map(([g]) => g))
  return {
    groups: snap.groups.filter((g) => keep.has(g.id)),
    parts: snap.parts.map((p) => (p.groupId && !keep.has(p.groupId) ? { ...p, groupId: undefined } : p)),
  }
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** Apply a change to parts/groups and record it for undo. */
      const edit = (fn: (snap: Snapshot) => Snapshot, selection?: string[]) =>
        set((s) => {
          const before: Snapshot = { parts: s.project.parts, groups: s.project.groups }
          const after = pruneGroups(fn(before))
          return {
            project: { ...s.project, ...after },
            past: [...s.past, before].slice(-HISTORY_LIMIT),
            future: [],
            ...(selection !== undefined ? { selection } : {}),
            // Adding/duplicating selects the new parts: that's a pick too
            ...(selection?.length ? { pickCount: s.pickCount + 1 } : {}),
          }
        })
      const editParts = (fn: (parts: Part[]) => Part[], selection?: string[]) =>
        edit((snap) => ({ ...snap, parts: fn(snap.parts) }), selection)

      const selected = () => {
        const ids = new Set(get().selection)
        return get().project.parts.filter((p) => ids.has(p.id))
      }
      /** Replace the selected parts with transformed versions. */
      const editSelection = (fn: (parts: Part[]) => Part[]) => {
        const changed = new Map(fn(selected()).map((p) => [p.id, p]))
        editParts((ps) => ps.map((p) => changed.get(p.id) ?? p))
      }
      const groupMembers = (id: string) => {
        const part = get().project.parts.find((p) => p.id === id)
        if (!part?.groupId) return [id]
        return get().project.parts.filter((p) => p.groupId === part.groupId).map((p) => p.id)
      }
      /** Apply a joint operation to parts a and b. */
      const joint = (aId: string, bId: string, fn: (a: Part, b: Part) => [Part, Part] | null) => {
        const parts = get().project.parts
        const a = parts.find((p) => p.id === aId)
        const b = parts.find((p) => p.id === bId)
        if (!a || !b) return
        const result = fn(a, b)
        if (!result) return
        editParts((ps) => ps.map((p) => (p.id === aId ? result[0] : p.id === bId ? result[1] : p)))
      }
      const overlapBox = (a: Part, b: Part) => overlapsOf(a, [b])[0]?.box ?? null

      const restore = (s: State, snap: Snapshot) => {
        const ids = new Set(snap.parts.map((p) => p.id))
        return { project: { ...s.project, ...snap }, selection: s.selection.filter((id) => ids.has(id)) }
      }

      return {
        project: emptyProject(),
        selection: [],
        pickCount: 0,
        multiSelect: false,
        measureMode: false,
        placeProfile: null,
        placeNote: null,
        placeChoice: null,
        pendingPoint: null,
        snapChoice: null,
        measureHover: null,
        settings: DEFAULT_SETTINGS,
        ownPrices: [],
        useExamplePrices: true,
        supplierFiles: [],
        disabledSuppliers: [],
        past: [],
        future: [],

        addPart: (profileId) => {
          const parts = get().project.parts
          // Drop the new board just in front of everything already in the scene
          const front = parts.reduce((z, p) => Math.max(z, partBox(p).max.z), -100)
          const prof = getProfile(profileId)
          const part: Part = {
            id: uid(),
            name: `${prof.name} #${parts.filter((p) => p.profileId === profileId).length + 1}`,
            profileId,
            length: prof.kind === 'sheet' ? 800 : 1000,
            ...(prof.kind === 'sheet' ? { width: prof.width } : {}),
            position: [0, 0, front + 100],
            rotation: [0, 0, 0],
          }
          editParts((ps) => [...ps, part], [part.id])
        },

        updatePart: (id, patch) => editParts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p))),

        tapPart: (id, additive = get().multiSelect) => {
          const ids = groupMembers(id)
          if (!additive) return set((s) => ({ selection: ids, pickCount: s.pickCount + 1 }))
          const current = new Set(get().selection)
          const allIn = ids.every((x) => current.has(x))
          ids.forEach((x) => (allIn ? current.delete(x) : current.add(x)))
          set((s) => ({ selection: [...current], pickCount: s.pickCount + 1 }))
        },
        select: (selection) => set((s) => ({ selection, pickCount: s.pickCount + 1 })),
        clearSelection: () => set({ selection: [] }),
        setMultiSelect: (multiSelect) => set({ multiSelect, ...(multiSelect ? { measureMode: false, pendingPoint: null } : {}) }),
        setPlaceProfile: (placeProfile) =>
          set({
            placeProfile,
            placeNote: null,
            placeChoice: null,
            ...(placeProfile ? { measureMode: false, pendingPoint: null, snapChoice: null, multiSelect: false } : {}),
          }),
        placeTap: (target) => {
          const profileId = get().placeProfile
          if (!profileId) return
          const parts = get().project.parts
          let options: Placement[]
          if ('floor' in target) {
            // A near miss next to a part on the floor goes on that part
            const near = floorTapTarget(target.floor, parts, target.margin)
            options = near
              ? placementOptions(profileId, near.part, near.hit, [0, 1, 0], parts)
              : [placeOnFloor(profileId, target.floor)]
          } else {
            const on = parts.find((p) => p.id === target.partId)
            if (!on) return
            options = placementOptions(profileId, on, target.hit, target.normal, parts, target.missed)
          }
          const prof = getProfile(profileId)
          const part: Part = {
            ...options[0].part,
            id: uid(),
            name: `${prof.name} #${parts.filter((p) => p.profileId === profileId).length + 1}`,
          }
          editParts((ps) => [...ps, part], [part.id])
          set({ placeNote: describePlacement(options[0]), placeChoice: { partId: part.id, options, index: 0 } })
        },
        cyclePlacement: () => {
          const c = get().placeChoice
          if (!c || c.options.length < 2) return
          const index = (c.index + 1) % c.options.length
          const next = c.options[index]
          // Replaces the placement itself (no undo step of its own), so one
          // Ångra still removes the board
          set((s) => ({
            project: {
              ...s.project,
              parts: s.project.parts.map((p) => (p.id === c.partId ? { ...p, ...next.part } : p)),
            },
            placeChoice: { ...c, index },
            placeNote: describePlacement(next),
          }))
        },
        setMeasureMode: (on) =>
          set({
            placeProfile: null,
            measureMode: on,
            pendingPoint: null,
            snapChoice: null,
            ...(on ? { selection: [], multiSelect: false } : {}),
          }),
        measureTap: (p, options = [p]) =>
          set((s) => {
            if (!s.pendingPoint) return { pendingPoint: p, snapChoice: { options, index: 0, target: 'pending' } }
            const m: Measurement = { id: uid(), a: s.pendingPoint, b: p }
            return {
              pendingPoint: null,
              snapChoice: { options, index: 0, target: { id: m.id } },
              project: { ...s.project, measurements: [...s.project.measurements, m] },
            }
          }),
        setMeasureHover: (measureHover) => {
          const cur = get().measureHover
          if (cur === measureHover || (cur && measureHover && cur.point.join() === measureHover.point.join() && cur.snap === measureHover.snap)) return
          set({ measureHover })
        },
        cycleSnap: () =>
          set((s) => {
            const c = s.snapChoice
            if (!c || c.options.length < 2) return s
            const index = (c.index + 1) % c.options.length
            const point = c.options[index]
            const snapChoice = { ...c, index }
            if (c.target === 'pending') return { snapChoice, pendingPoint: point }
            const id = c.target.id
            return {
              snapChoice,
              project: {
                ...s.project,
                measurements: s.project.measurements.map((m) => (m.id === id ? { ...m, b: point } : m)),
              },
            }
          }),
        removeMeasurement: (id) =>
          set((s) => ({
            project: { ...s.project, measurements: s.project.measurements.filter((m) => m.id !== id) },
            snapChoice: s.snapChoice && s.snapChoice.target !== 'pending' && s.snapChoice.target.id === id ? null : s.snapChoice,
          })),
        clearMeasurements: () =>
          set((s) => ({ project: { ...s.project, measurements: [] }, pendingPoint: null, snapChoice: null })),

        moveSelection: (d) => editSelection((ps) => moveParts(ps, d)),
        rotateSelection: (axis) =>
          editSelection((ps) => (ps.length === 1 ? [rotatePart(ps[0], axis)] : rotateParts(ps, axis))),

        duplicateSelection: () => {
          const src = selected()
          const box = unionBox(src)
          if (!box) return
          // New groups for copies of grouped parts
          const groupMap = new Map<string, Group>()
          for (const p of src)
            if (p.groupId && !groupMap.has(p.groupId)) {
              const g = get().project.groups.find((x) => x.id === p.groupId)
              groupMap.set(p.groupId, { id: uid(), name: `${g?.name ?? 'Grupp'} (kopia)` })
            }
          const copies = moveParts(src, [0, 0, box.max[2] - box.min[2] + 50]).map((p) => ({
            ...p,
            id: uid(),
            name: src.length === 1 ? `${p.name} (kopia)` : p.name,
            groupId: p.groupId ? groupMap.get(p.groupId)!.id : undefined,
          }))
          edit(
            (snap) => ({ parts: [...snap.parts, ...copies], groups: [...snap.groups, ...groupMap.values()] }),
            copies.map((p) => p.id),
          )
        },

        removeSelection: () => {
          const ids = new Set(get().selection)
          editParts((ps) => ps.filter((p) => !ids.has(p.id)), [])
        },

        groupSelection: (name) => {
          const ids = new Set(get().selection)
          if (ids.size < 2) return
          const group: Group = { id: uid(), name: name.trim() || 'Grupp' }
          edit((snap) => ({
            groups: [...snap.groups, group],
            parts: snap.parts.map((p) => (ids.has(p.id) ? { ...p, groupId: group.id } : p)),
          }))
        },

        ungroup: (groupId) =>
          edit((snap) => ({
            groups: snap.groups.filter((g) => g.id !== groupId),
            parts: snap.parts.map((p) => (p.groupId === groupId ? { ...p, groupId: undefined } : p)),
          })),

        renameGroup: (groupId, name) =>
          edit((snap) => ({ ...snap, groups: snap.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) })),

        trimTo: (partId, otherId) =>
          joint(partId, otherId, (a, b) => {
            const box = overlapBox(a, b)
            const trimmed = box && trimAgainst(a, box)
            return trimmed ? [trimmed, b] : null
          }),
        notchWith: (partId, otherId) =>
          joint(partId, otherId, (a, b) => {
            const box = overlapBox(a, b)
            return box ? [notchAgainst(a, box, 'urtag', b.name), b] : null
          }),
        halfLapWith: (partId, otherId) =>
          joint(partId, otherId, (a, b) => {
            const box = overlapBox(a, b)
            return box ? halfLap(a, b, box) : null
          }),
        removeNotch: (partId, index) =>
          editParts((ps) =>
            ps.map((p) => {
              if (p.id !== partId || !p.notches) return p
              const notches = p.notches.filter((_, i) => i !== index)
              return { ...p, notches: notches.length ? notches : undefined }
            }),
          ),

        setEndCut: (partId, end, cut) => {
          const parts = get().project.parts
          const part = parts.find((p) => p.id === partId)
          if (!part) return
          // An end that meets another board's end at a corner: make both match
          const partner = findCornerPartner(part, end, parts)
          if (partner) {
            const pair = cut && cut.angle ? cornerMiter(part, end, partner) : cornerButt(part, end, partner)
            if (pair) {
              const [a, b] = pair
              editParts((ps) => ps.map((p) => (p.id === a.id ? a : p.id === b.id ? b : p)))
              return
            }
          }
          editParts((ps) =>
            ps.map((p) => {
              if (p.id !== partId) return p
              const ends = [...(p.ends ?? [null, null])] as [EndCut | null, EndCut | null]
              ends[end] = cut && cut.angle ? cut : null
              return { ...p, ends: ends.some(Boolean) ? ends : undefined }
            }),
          )
        },
        miterWith: (partId, otherId) =>
          joint(partId, otherId, (a, b) => {
            const box = overlapBox(a, b)
            return box ? miterCorner(a, b, box, toLocalBox) : null
          }),
        frenchCleat: (partId, angle) => {
          const part = get().project.parts.find((p) => p.id === partId)
          if (!part || part.rip) return
          const halves = ripPart(part, angle, get().settings.kerf, uid)
          editParts(
            (ps) => ps.flatMap((p) => (p.id === partId ? halves : [p])),
            [halves[0].id],
          )
        },

        undo: () =>
          set((s) => {
            const prev = s.past[s.past.length - 1]
            if (!prev) return s
            return {
              ...restore(s, prev),
              past: s.past.slice(0, -1),
              future: [{ parts: s.project.parts, groups: s.project.groups }, ...s.future],
            }
          }),

        redo: () =>
          set((s) => {
            const next = s.future[0]
            if (!next) return s
            return {
              ...restore(s, next),
              past: [...s.past, { parts: s.project.parts, groups: s.project.groups }],
              future: s.future.slice(1),
            }
          }),

        setProjectName: (name) => set((s) => ({ project: { ...s.project, name } })),

        newProject: () => set({ project: emptyProject(), selection: [], past: [], future: [] }),

        loadProject: (project) => set({ project: normalizeProject(project), selection: [], past: [], future: [] }),

        setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

        setOwnPrice: (profileId, price) =>
          set((s) => ({
            ownPrices: [
              ...s.ownPrices.filter((e) => e.profileId !== profileId),
              ...(price !== null && price > 0
                ? [{ profileId, supplier: 'Egen', unit: getProfile(profileId).kind === 'sheet' ? ('st' as const) : ('lm' as const), price }]
                : []),
            ],
          })),

        setUseExamplePrices: (useExamplePrices) => set({ useExamplePrices }),

        addSupplierFile: (file) =>
          set((s) => ({ supplierFiles: [...s.supplierFiles.filter((f) => f.supplier !== file.supplier), file] })),

        setSupplierEnabled: (supplier, enabled) =>
          set((s) => ({
            disabledSuppliers: enabled
              ? s.disabledSuppliers.filter((x) => x !== supplier)
              : [...new Set([...s.disabledSuppliers, supplier])],
          })),
      }
    },
    {
      name: 'snickerei',
      version: 1,
      // Settings and project fields added in later versions get their defaults
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>
        return {
          ...current,
          ...p,
          project: normalizeProject(p.project),
          settings: {
            ...DEFAULT_SETTINGS,
            ...p.settings,
            snapTypes: { ...DEFAULT_SNAP_TYPES, ...p.settings?.snapTypes },
          },
        }
      },
      // Undo history and selection are session-only
      partialize: (s) => ({
        project: s.project,
        settings: s.settings,
        ownPrices: s.ownPrices,
        useExamplePrices: s.useExamplePrices,
        disabledSuppliers: s.disabledSuppliers,
      }),
    },
  ),
)

/** The selected parts, in project order. */
export function useSelectedParts(): Part[] {
  const parts = useStore((s) => s.project.parts)
  const selection = useStore((s) => s.selection)
  return useMemo(() => {
    const ids = new Set(selection)
    return parts.filter((p) => ids.has(p.id))
  }, [parts, selection])
}

type PriceState = Pick<State, 'ownPrices' | 'useExamplePrices' | 'supplierFiles' | 'disabledSuppliers'>

const supplierCache = new WeakMap<SupplierPriceFile, PriceEntry[]>()
function entriesOf(file: SupplierPriceFile): PriceEntry[] {
  let e = supplierCache.get(file)
  if (!e) supplierCache.set(file, (e = supplierEntries(file)))
  return e
}

/** All prices in effect: own prices, then enabled suppliers, then (optionally) examples. */
export function activePrices(s: PriceState): PriceEntry[] {
  const suppliers = s.supplierFiles
    .filter((f) => !s.disabledSuppliers.includes(f.supplier))
    .flatMap(entriesOf)
  return mergePrices(s.ownPrices, suppliers, s.useExamplePrices ? EXAMPLE_PRICES : [])
}

/** Load the supplier price files shipped with the app. */
export async function loadSupplierPrices(names = ['bauhaus']) {
  for (const name of names) {
    try {
      const res = await fetch(`./prices/${name}.json`, { cache: 'no-cache' })
      if (res.ok) useStore.getState().addSupplierFile(await res.json())
    } catch {
      // Offline or file missing: hand-entered and example prices still work
    }
  }
}
