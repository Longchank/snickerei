import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { EXAMPLE_PRICES, getProfile } from './catalog'
import { useMemo } from 'react'
import { partBox, rotatePart } from './geometry'
import { halfLap, moveParts, notchAgainst, overlapsOf, rotateParts, trimAgainst, unionBox } from './joints'
import { mergePrices, supplierEntries } from './prices'
import type { Group, Part, PriceEntry, Project, Settings, SupplierPriceFile, Vec3 } from './types'

const HISTORY_LIMIT = 100

/** What undo/redo restores */
type Snapshot = Pick<Project, 'parts' | 'groups'>

interface State {
  project: Project
  /** Selected part ids */
  selection: string[]
  /** Phone: taps add to / remove from the selection instead of replacing it */
  multiSelect: boolean
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

const DEFAULT_SETTINGS: Settings = { snap: 5, kerf: 3, showDimensions: true, snapToParts: true }

const uid = () => Math.random().toString(36).slice(2, 10)

const emptyProject = (): Project => ({ name: 'Nytt projekt', parts: [], groups: [] })

/** Older saves and imported files may lack newer fields. */
export function normalizeProject(p: Partial<Project> | undefined): Project {
  return { name: p?.name ?? 'Nytt projekt', parts: p?.parts ?? [], groups: p?.groups ?? [] }
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
        multiSelect: false,
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
          if (!additive) return set({ selection: ids })
          const current = new Set(get().selection)
          const allIn = ids.every((x) => current.has(x))
          ids.forEach((x) => (allIn ? current.delete(x) : current.add(x)))
          set({ selection: [...current] })
        },
        select: (selection) => set({ selection }),
        clearSelection: () => set({ selection: [] }),
        setMultiSelect: (multiSelect) => set({ multiSelect }),

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
          settings: { ...DEFAULT_SETTINGS, ...p.settings },
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
