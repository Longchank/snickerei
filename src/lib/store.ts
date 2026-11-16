import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { EXAMPLE_PRICES, getProfile } from './catalog'
import { partBox, rotatePart } from './geometry'
import { mergePrices, supplierEntries } from './prices'
import type { Part, PriceEntry, Project, Settings, SupplierPriceFile } from './types'

const HISTORY_LIMIT = 100

interface State {
  project: Project
  selectedId: string | null
  settings: Settings
  /** Hand-entered prices (supplier "Egen"). Scraped prices will be merged in later. */
  ownPrices: PriceEntry[]
  useExamplePrices: boolean
  /** Price files loaded from public/prices/ — not persisted, reloaded at start */
  supplierFiles: SupplierPriceFile[]
  /** Supplier name → whether its prices are used (default: on) */
  disabledSuppliers: string[]
  past: Part[][]
  future: Part[][]

  addPart: (profileId: string) => void
  updatePart: (id: string, patch: Partial<Omit<Part, 'id'>>) => void
  removePart: (id: string) => void
  duplicatePart: (id: string) => void
  rotate: (id: string, axis: 0 | 1 | 2) => void
  select: (id: string | null) => void
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

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** Apply a change to the parts list and record it for undo. */
      const edit = (fn: (parts: Part[]) => Part[], selectedId?: string | null) =>
        set((s) => ({
          project: { ...s.project, parts: fn(s.project.parts) },
          past: [...s.past, s.project.parts].slice(-HISTORY_LIMIT),
          future: [],
          ...(selectedId !== undefined ? { selectedId } : {}),
        }))

      return {
        project: { name: 'Nytt projekt', parts: [] },
        selectedId: null,
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
          edit((ps) => [...ps, part], part.id)
        },

        updatePart: (id, patch) => edit((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p))),

        removePart: (id) =>
          edit((ps) => ps.filter((p) => p.id !== id), get().selectedId === id ? null : get().selectedId),

        duplicatePart: (id) => {
          const src = get().project.parts.find((p) => p.id === id)
          if (!src) return
          const box = partBox(src)
          const copy: Part = {
            ...src,
            id: uid(),
            name: `${src.name} (kopia)`,
            position: [src.position[0], src.position[1], src.position[2] + (box.max.z - box.min.z) + 50],
          }
          edit((ps) => [...ps, copy], copy.id)
        },

        rotate: (id, axis) => edit((ps) => ps.map((p) => (p.id === id ? rotatePart(p, axis) : p))),

        select: (selectedId) => set({ selectedId }),

        undo: () =>
          set((s) => {
            const prev = s.past[s.past.length - 1]
            if (!prev) return s
            return {
              project: { ...s.project, parts: prev },
              past: s.past.slice(0, -1),
              future: [s.project.parts, ...s.future],
              selectedId: prev.some((p) => p.id === s.selectedId) ? s.selectedId : null,
            }
          }),

        redo: () =>
          set((s) => {
            const next = s.future[0]
            if (!next) return s
            return {
              project: { ...s.project, parts: next },
              past: [...s.past, s.project.parts],
              future: s.future.slice(1),
              selectedId: next.some((p) => p.id === s.selectedId) ? s.selectedId : null,
            }
          }),

        setProjectName: (name) => set((s) => ({ project: { ...s.project, name } })),

        newProject: () =>
          set({ project: { name: 'Nytt projekt', parts: [] }, selectedId: null, past: [], future: [] }),

        loadProject: (project) => set({ project, selectedId: null, past: [], future: [] }),

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
      // Settings added in later versions get their defaults
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } }
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
