import { create } from 'zustand'
import { isLocked, toggleCheck, type CheckList } from './progress'
import { persist } from 'zustand/middleware'
import { EXAMPLE_PRICES, getProfile } from './catalog'
import { useMemo } from 'react'
import { partBox, rotatePart, toAxisBox } from './geometry'
import { setSizeAlong, stretchParts } from './resize'
import type { OwnSheetSizes, OwnStockLengths } from './cutlist'
import { buildFrame, defaultJoists, isLyingSheet, rebuildFrame, sheetForFrame } from './frame'
import { cornerButt, cornerMiter, findCornerPartner, switchButtJoints } from './corner'
import { miterCorner, ripPart } from './cuts'
import { moveNextTo, moveToFloor } from './move'
import { copyPlane, mirrorParts } from './mirror'
import { toPhase } from './phases'
import type { JointAnchor, ScrewEdit } from './screws'
import { planScrews, reverseEdits, screwJoints } from './screws'
import { faceFromNormal, nearestFace, scaleBy, scaleTarget, scaleTo, type ScaleFace } from './scale'
import {
  halfLap,
  moveParts,
  notchAgainst,
  overlapsOf,
  rotateParts,
  rotatePartsInPlace,
  toLocalBox,
  trimAgainst,
  unionBox,
} from './joints'
import { mergePrices, supplierEntries } from './prices'
import { describePlacement, floorTapTarget, placementOptions, placeOnFloor, reorientOptions, samePlacement, sheetBetween, type Placement, type SheetCorner } from './place'
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
  Purpose,
  SheetFrame,
  ProfileCategory,
} from './types'

const HISTORY_LIMIT = 100

/** What undo/redo restores */
type Snapshot = Pick<Project, 'parts' | 'groups' | 'screwEdits'>

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
  /** Colour the model by the strength analysis (Analys tab) */
  analysisView: boolean
  setAnalysisView: (on: boolean) => void
  /** Build step being shown (a group id or 'montering'); null = everything */
  activeStep: string | null
  setActiveStep: (id: string | null) => void
  /** Hide parts in 3D; show all hidden again; show only these */
  hideParts: (ids: string[]) => void
  showAllParts: () => void
  isolateParts: (ids: string[]) => void
  /** Lock parts (they drop out of the selection) / unlock some or all */
  lockParts: (ids: string[]) => void
  unlockParts: (ids?: string[]) => void
  /** The checklist item to show (a "!" in 3D was tapped); n changes on every tap */
  checkFocus: { id: string; n: number } | null
  focusCheck: (id: string) => void
  /** The screw being edited in 3D (Detaljer): its joint and which screw */
  screwFocus: { key: string; index: number } | null
  focusScrew: (f: { key: string; index: number } | null) => void
  /** Skala (Detaljer): taps pick the face of the selected part that grows, then where it ends */
  scaleMode: boolean
  scaleFace: ScaleFace | null
  setScaleMode: (on: boolean) => void
  setScaleFace: (f: ScaleFace | null) => void
  scaleTap: (target: { partId: string; hit: Vec3; normal: Vec3 } | { floor: Vec3 }) => void
  scaleStep: (delta: number) => void
  /** "Ny fog" (Detaljer): taps on the model start a joint there */
  jointMode: boolean
  jointDraft: JointDraft | null
  setJointMode: (on: boolean) => void
  setJointDraft: (d: JointDraft | null) => void
  /** Ask the phone panel to open or close (n changes on every request) */
  panelRequest: { open: boolean; tab?: string; n: number } | null
  /** Open/close the phone panel, optionally on a given tab */
  requestPanel: (open: boolean, tab?: string) => void
  /** The view's tool menu is folded out (the phone panel closes meanwhile) */
  toolsOpen: boolean
  setToolsOpen: (on: boolean) => void
  /** X-ray: everything not selected is see-through */
  xray: boolean
  setXray: (on: boolean) => void
  /** Show the suggested screws as coloured dots in 3D (Listor → Skruv) */
  screwView: boolean
  setScrewView: (on: boolean) => void
  setPurpose: (purpose: Purpose) => void
  /** Screws in one joint set by hand; null = back to the suggestion (undoable) */
  setScrewCount: (key: string, count: number | null) => void
  /** Hand edits to one joint, merged in (undefined/false fields go back to the suggestion); null removes them all */
  setScrewEdit: (key: string, patch: Partial<ScrewEdit> | null) => void
  /** Take every suggested joint (among these parts, or all) into the build: one undo step */
  fillScrews: (partIds?: string[]) => void
  /** The joint's screws go in from the other side (returns the joint's new key) */
  reverseJoint: (key: string) => string
  /** Moving the selection: arrows in the view, taps put it next to a board */
  moveMode: boolean
  /** Placing boards of this profile: taps on the model place one each */
  placeProfile: string | null
  /** What the last placement did, for the banner */
  placeNote: string | null
  /** Other ways the last placed board could go, to cycle through */
  placeChoice: { partId: string; options: Placement[]; index: number } | null
  /** Placing a sheet: the first corner tapped, waiting for the opposite one */
  sheetCorner: SheetCorner | null
  /** "Ram under skivan" open: the sheet as it was when opened, and whether an undo step was taken */
  frameSheet: { base: Part; groupId: string; started: boolean } | null
  openFrame: (sheetId: string) => void
  applyFrame: (f: SheetFrame) => void
  removeFrame: () => void
  closeFrame: () => void
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
  /** A tap on a part in the view, by step: Skissa toggles its group, Verkstad picks its group, Detaljer/Handla just it */
  pickPart: (id: string, modifier?: boolean) => void
  /** `force`: switch even while the model is locked (just looking) */
  setMode: (mode: Settings['mode'], force?: boolean) => void
  /** The model is locked (pieces checked off as cut) and something tried to change it, or a step to draw in was picked */
  lockPrompt: { mode?: Settings['mode'] } | null
  closeLockPrompt: () => void
  /** Empty the cut checklist, which unlocks the model */
  unlockModel: () => void
  /** Check off (or back) something bought, cut or built */
  toggleCheck: (list: CheckList, key: string) => void
  setMoveMode: (on: boolean) => void
  /** A tap while moving: next to a board's face, or onto the floor */
  moveTap: (target: { partId: string; hit: Vec3; normal: Vec3 } | { floor: Vec3 }) => void
  setMeasureMode: (on: boolean) => void
  setPlaceProfile: (profileId: string | null) => void
  /** A tap while placing: on a part's face (with outward normal) or the floor */
  /** `margin`: how far (mm) from a part a floor tap still counts as a tap on it */
  placeTap: (
    target: { partId: string; hit: Vec3; normal: Vec3; missed?: boolean; snapped?: boolean } | { floor: Vec3; margin?: number },
  ) => void
  /** Put the last placed board the next way instead */
  cyclePlacement: () => void
  /** "Annan riktning" for the one selected, already placed board */
  reorientSelection: () => void
  /** A tap in measuring mode: first tap starts, second finishes a measurement.
   * `options` are the snap alternatives for this tap, best (= p) first. */
  measureTap: (p: MeasurePoint, options?: MeasurePoint[]) => void
  /** Use the next snap alternative for the most recent tap */
  cycleSnap: () => void
  setMeasureHover: (p: MeasurePoint | null) => void
  removeMeasurement: (id: string) => void
  clearMeasurements: () => void

  moveSelection: (d: Vec3) => void
  /** A size label in the view: one part changes size, several (or none = all) stretch */
  resizeSelection: (axis: 0 | 1 | 2, size: number) => void
  rotateSelection: (axis: 0 | 1 | 2) => void
  /** Turn the selection 90° either way around an axis, in place */
  rotateSelectionStep: (axis: 0 | 1 | 2, dir: 1 | -1) => void
  /** Turning the selection: rings in the view, 90° per tap */
  rotateMode: boolean
  setRotateMode: (on: boolean) => void
  duplicateSelection: () => void
  mirrorMode: boolean
  setMirrorMode: (on: boolean) => void
  /** Mirror the selection along a world axis: a mirrored copy, or flipped in place */
  mirrorSelection: (axis: 0 | 1 | 2, copy: boolean) => void
  removeSelection: () => void
  groupSelection: (name: string) => void
  ungroup: (groupId: string) => void
  renameGroup: (groupId: string, name: string) => void
  /** Build order: these groups first, in this order (the rest keep theirs, after) */
  setGroupOrder: (ids: string[]) => void
  /** These parts, in this order, in the places they already take in the parts list */
  reorderParts: (ids: string[]) => void

  /** Joints between a part and one it overlaps */
  trimTo: (partId: string, otherId: string) => void
  notchWith: (partId: string, otherId: string) => void
  halfLapWith: (partId: string, otherId: string) => void
  removeNotch: (partId: string, index: number) => void
  /** Angled end cut; end 0 = start, 1 = end; null = square */
  setEndCut: (partId: string, end: 0 | 1, cut: EndCut | null) => void
  miterWith: (partId: string, otherId: string) => void
  /** Swap which of two boards meeting in a square corner runs through (they only slide) */
  /** ⇄ Byt stötfog: the selection's corner (two boards) or its whole frame, re-cut so the outer size stays */
  switchButtJoints: () => void
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
  /** Store sheet sizes you entered, per material; none = the standard sizes */
  ownSheetSizes: OwnSheetSizes
  setOwnSheetSizes: (category: ProfileCategory, sizes: [number, number][] | null) => void
  /** Board lengths you entered, per timber category; none = the standard lengths */
  ownStockLengths: OwnStockLengths
  setOwnStockLengths: (category: ProfileCategory, lengths: number[] | null) => void
  addSupplierFile: (file: SupplierPriceFile) => void
  setSupplierEnabled: (supplier: string, enabled: boolean) => void
}

/** A joint being placed by hand: the tapped face and the choices in the bar */
export interface JointDraft {
  throughId: string
  hit: Vec3
  normal: Vec3
  /** Unset = guessed from where the face was tapped */
  anchor?: JointAnchor
  count: number
  flip: boolean
  d?: number
  length?: number
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
  mode: 'skissa',
  freeMove: false,
  moveStep: 10,
}

const uid = () => Math.random().toString(36).slice(2, 10)

const emptyProject = (): Project => ({ name: 'Nytt projekt', parts: [], groups: [], measurements: [], screwsByHand: true })

/** Older saves and imported files may lack newer fields. */
/** Hand screw edits; projects saved before 2026-11-22 had only counts (`screwCounts`) */
function screwEditsOf(p: Partial<Project> | undefined): Record<string, ScrewEdit> | undefined {
  if (p?.screwEdits) return p.screwEdits
  const old = (p as { screwCounts?: Record<string, number> } | undefined)?.screwCounts
  return old ? Object.fromEntries(Object.entries(old).map(([k, count]) => [k, { count }])) : undefined
}

export function normalizeProject(p: Partial<Project> | undefined): Project {
  const parts = p?.parts ?? []
  let edits = screwEditsOf(p)
  // Saved before joints became opt-in (2026-11-23): keep the screws it had —
  // every suggested joint that wasn't switched off is taken in
  if (!p?.screwsByHand && parts.length) {
    const next: Record<string, ScrewEdit> = {}
    for (const j of screwJoints(parts, edits ?? {}, { all: true })) {
      const e = edits?.[j.key]
      if (e?.off) continue
      next[j.key] = { ...e, on: true }
    }
    for (const [k, e] of Object.entries(edits ?? {})) if (e.manual && !e.off) next[k] = e
    edits = Object.keys(next).length ? next : undefined
  }
  return {
    name: p?.name ?? 'Nytt projekt',
    parts,
    groups: p?.groups ?? [],
    measurements: p?.measurements ?? [],
    screwsByHand: true,
    ...(p?.purpose ? { purpose: p.purpose } : {}),
    ...(edits ? { screwEdits: edits } : {}),
    // Cut checks from the first version (2026-11-26, keyed by cut-list row with '|') don't match any piece any more
    ...(p?.checks ? { checks: { ...p.checks, ...(p.checks.cut ? { cut: p.checks.cut.filter((k) => !k.includes('|')) } : {}) } } : {}),
  }
}

/** Drop groups with fewer than two parts (a group of one is just a part). */
function pruneGroups(snap: Snapshot): Snapshot {
  const counts = new Map<string, number>()
  snap.parts.forEach((p) => p.groupId && counts.set(p.groupId, (counts.get(p.groupId) ?? 0) + 1))
  const keep = new Set([...counts].filter(([, n]) => n >= 2).map(([g]) => g))
  return {
    ...snap,
    groups: snap.groups.filter((g) => keep.has(g.id)),
    parts: snap.parts.map((p) => (p.groupId && !keep.has(p.groupId) ? { ...p, groupId: undefined } : p)),
  }
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** While pieces are checked off as cut the model is locked: ask to unlock instead */
      const blocked = () => {
        if (!isLocked(get().project)) return false
        set({ lockPrompt: {} })
        return true
      }
      /** Apply a change to parts/groups and record it for undo. */
      const edit = (fn: (snap: Snapshot) => Snapshot, selection?: string[]) =>
        !blocked() &&
        set((s) => {
          const before: Snapshot = { parts: s.project.parts, groups: s.project.groups, screwEdits: s.project.screwEdits }
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
        return get().project.parts.filter((p) => ids.has(p.id) && !p.locked)
      }
      /** Replace the selected parts with transformed versions. */
      const editSelection = (fn: (parts: Part[]) => Part[]) => {
        const changed = new Map(fn(selected()).map((p) => [p.id, p]))
        editParts((ps) => ps.map((p) => changed.get(p.id) ?? p))
      }
      const groupMembers = (id: string) => {
        const part = get().project.parts.find((p) => p.id === id)
        if (!part || part.locked) return []
        if (!part.groupId) return [id]
        return get().project.parts.filter((p) => p.groupId === part.groupId && !p.locked).map((p) => p.id)
      }
      /** Locked parts can't be selected */
      const unlocked = (ids: string[]) => {
        const locked = new Set(get().project.parts.filter((p) => p.locked).map((p) => p.id))
        return locked.size ? ids.filter((id) => !locked.has(id)) : ids
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
        analysisView: false,
        setAnalysisView: (analysisView) => set({ analysisView }),
        activeStep: null,
        setActiveStep: (activeStep) => set({ activeStep }),
        hideParts: (ids) => {
          const hide = new Set(ids)
          editParts((ps) => ps.map((p) => (hide.has(p.id) ? { ...p, hidden: true } : p)), [])
        },
        showAllParts: () => editParts((ps) => ps.map((p) => (p.hidden ? { ...p, hidden: undefined } : p))),
        isolateParts: (ids) => {
          const keep = new Set(ids)
          editParts((ps) => ps.map((p) => (keep.has(p.id) ? { ...p, hidden: undefined } : { ...p, hidden: true })))
        },
        lockParts: (ids) => {
          const lock = new Set(ids)
          editParts((ps) => ps.map((p) => (lock.has(p.id) ? { ...p, locked: true } : p)), [])
        },
        unlockParts: (ids) => {
          const open = ids && new Set(ids)
          editParts((ps) => ps.map((p) => (p.locked && (!open || open.has(p.id)) ? { ...p, locked: undefined } : p)))
        },
        checkFocus: null,
        focusCheck: (id) => set((s) => ({ checkFocus: { id, n: (s.checkFocus?.n ?? 0) + 1 } })),
        screwFocus: null,
        focusScrew: (screwFocus) => set({ screwFocus, ...(screwFocus ? { jointMode: false, jointDraft: null } : {}) }),
        scaleMode: false,
        scaleFace: null,
        setScaleMode: (on) =>
          set({
            scaleMode: on,
            scaleFace: null,
            // Skala and Ny fog both live in Detaljer and both take the taps: one at a time
            ...(on ? { jointMode: false, jointDraft: null, screwFocus: null, moveMode: false, rotateMode: false, mirrorMode: false, measureMode: false, pendingPoint: null, placeProfile: null } : {}),
          }),
        setScaleFace: (scaleFace) => set({ scaleFace }),
        scaleTap: (target) => {
          const { scaleFace, selection, project } = get()
          const part = project.parts.find((p) => p.id === selection[0])
          if (!part) return
          // A tap on the part itself picks the end that grows: the tapped end, or the nearest one
          if ('partId' in target && target.partId === part.id) {
            const f = faceFromNormal(part, target.normal) ?? nearestFace(part, target.hit)
            if (f) set({ scaleFace: f })
            return
          }
          if (!scaleFace) return
          const other = 'partId' in target ? project.parts.find((p) => p.id === target.partId) ?? null : null
          const coord =
            'floor' in target ? scaleTarget(part, scaleFace, target.floor, null, null) : scaleTarget(part, scaleFace, target.hit, target.normal, other)
          editParts((ps) => ps.map((p) => (p.id === part.id ? scaleTo(p, scaleFace, coord) : p)))
        },
        scaleStep: (delta) => {
          const { scaleFace, selection } = get()
          if (!scaleFace || selection.length !== 1) return
          editParts((ps) => ps.map((p) => (p.id === selection[0] ? scaleBy(p, scaleFace, delta) : p)))
        },
        jointMode: false,
        jointDraft: null,
        setJointMode: (on) =>
          set({
            jointMode: on,
            jointDraft: null,
            ...(on ? { scaleMode: false, scaleFace: null, screwFocus: null, measureMode: false, pendingPoint: null, moveMode: false, rotateMode: false, mirrorMode: false, placeProfile: null } : {}),
          }),
        setJointDraft: (jointDraft) => set({ jointDraft }),
        panelRequest: null,
        requestPanel: (open, tab) => set((s) => ({ panelRequest: { open, tab, n: (s.panelRequest?.n ?? 0) + 1 } })),
        toolsOpen: false,
        setToolsOpen: (toolsOpen) => set({ toolsOpen }),
        xray: false,
        setXray: (xray) => set({ xray }),
        screwView: false,
        setScrewView: (screwView) => set({ screwView }),
        setPurpose: (purpose) => set((s) => ({ project: { ...s.project, purpose } })),
        reverseJoint: (key) => {
          const [a, b] = key.split('|')
          edit((snap) => {
            const next = reverseEdits(snap.screwEdits ?? {}, key)
            return { ...snap, screwEdits: Object.keys(next).length ? next : undefined }
          })
          return `${b}|${a}`
        },
        fillScrews: (partIds) =>
          edit((snap) => {
            // Planned as a whole: build order, no screws into each other, no needless end-grain joints
            const plan = planScrews(snap.parts, snap.screwEdits ?? {}, snap.groups.map((g) => g.id), partIds && new Set(partIds))
            const next = { ...snap.screwEdits, ...plan }
            return { ...snap, screwEdits: Object.keys(next).length ? next : undefined }
          }),
        setScrewEdit: (key, patch) =>
          edit((snap) => {
            const next = { ...snap.screwEdits }
            if (patch === null) delete next[key]
            else {
              const merged: ScrewEdit = { ...next[key], ...patch }
              if (merged.count !== undefined) merged.count = Math.max(1, Math.min(20, Math.round(merged.count)))
              // Drop fields set back to "follow the suggestion"
              for (const k of Object.keys(merged) as (keyof ScrewEdit)[]) if (merged[k] === undefined || merged[k] === false) delete merged[k]
              if (Object.keys(merged).length) next[key] = merged
              else delete next[key]
            }
            return { ...snap, screwEdits: Object.keys(next).length ? next : undefined }
          }),
        setScrewCount: (key, count) => get().setScrewEdit(key, { count: count ?? undefined }),
        moveMode: false,
        placeProfile: null,
        placeNote: null,
        placeChoice: null,
        sheetCorner: null,
        frameSheet: null,
        openFrame: (sheetId) => {
          const sheet = get().project.parts.find((p) => p.id === sheetId)
          if (!sheet || !isLyingSheet(sheet)) return
          set({ frameSheet: { base: sheet, groupId: sheet.groupId ?? uid(), started: false }, moveMode: false, rotateMode: false, mirrorMode: false, measureMode: false, placeProfile: null })
          // Legs follow the sheet's current height (it may have been stretched or moved since)
          const top = toAxisBox(partBox(sheet)).max[1]
          const f = sheet.frame
          get().applyFrame(
            f ? (f.legs ? { ...f, legs: { ...f.legs, height: Math.round(top) } } : f) : { profileId: 'konstruktion-45x70', joists: defaultJoists(sheet), onEdge: true },
          )
        },
        applyFrame: (f) => {
          if (blocked()) return
          const fs = get().frameSheet
          if (!fs) return
          const { base: original, groupId } = fs
          const { sheet, parts: frameParts } = buildFrame(original, f, groupId)
          const base = original
          const apply = (snap: Snapshot): Snapshot => ({
            groups: snap.groups.some((g) => g.id === groupId) ? snap.groups : [...snap.groups, { id: groupId, name: 'Skiva med ram' }],
            parts: [...snap.parts.filter((p) => p.frameOf !== base.id && p.id !== base.id), sheet, ...frameParts],
          })
          const ids = [sheet.id, ...frameParts.map((p) => p.id)]
          if (!fs.started) {
            edit(apply, ids)
            set({ frameSheet: { ...fs, started: true } })
          } else
            set((s) => ({ project: { ...s.project, ...pruneGroups(apply({ parts: s.project.parts, groups: s.project.groups })) }, selection: ids }))
        },
        removeFrame: () => {
          const fs = get().frameSheet
          if (!fs) return
          const base = sheetForFrame(fs.base, fs.base.frame, undefined)
          const sheet: Part = { ...base, frame: undefined }
          edit((snap) => ({ ...snap, parts: [...snap.parts.filter((p) => p.frameOf !== base.id && p.id !== base.id), sheet] }), [sheet.id])
          set({ frameSheet: null })
        },
        closeFrame: () => set({ frameSheet: null }),
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
          if (!ids.length) return
          if (!additive) return set((s) => ({ selection: ids, pickCount: s.pickCount + 1 }))
          const current = new Set(get().selection)
          const allIn = ids.every((x) => current.has(x))
          ids.forEach((x) => (allIn ? current.delete(x) : current.add(x)))
          set((s) => ({ selection: [...current], pickCount: s.pickCount + 1 }))
        },
        select: (ids) => set((s) => ({ selection: unlocked(ids), pickCount: s.pickCount + 1 })),
        clearSelection: () => set({ selection: [] }),
        pickPart: (id, modifier = false) => {
          const mode = get().settings.mode
          if (mode === 'skissa') return get().tapPart(id, true)
          // Verkstad: a tap shows one group (a build step); modifier adds more
          if (mode === 'verkstad') return get().tapPart(id, modifier)
          if (modifier) return get().tapPart(id, true)
          if (!unlocked([id]).length) return
          set((s) => ({ selection: [id], pickCount: s.pickCount + 1 }))
        },
        lockPrompt: null,
        closeLockPrompt: () => set({ lockPrompt: null }),
        unlockModel: () => set((s) => ({ project: { ...s.project, checks: { ...s.project.checks, cut: [] } }, lockPrompt: null })),
        toggleCheck: (list, key) => set((s) => ({ project: { ...s.project, checks: toggleCheck(s.project.checks, list, key) } })),
        setMode: (mode, force = false) =>
          // Back to drawing while the model is locked: ask first
          !force && (mode === 'skissa' || mode === 'detaljer') && isLocked(get().project)
            ? set({ lockPrompt: { mode } })
            : set((s) => ({
            lockPrompt: null,
            settings: { ...s.settings, mode },
            moveMode: false,
            rotateMode: false, mirrorMode: false,
            frameSheet: null,
            // Detaljer works on one part at a time
            selection: mode === 'detaljer' ? s.selection.slice(0, 1) : s.selection,
          })),
        setMoveMode: (moveMode) =>
          set({
            moveMode,
            ...(moveMode ? { rotateMode: false, mirrorMode: false, measureMode: false, placeProfile: null, pendingPoint: null, frameSheet: null } : {}),
          }),
        moveTap: (target) => {
          const ids = new Set(get().selection)
          const sel = unionBox(get().project.parts.filter((p) => ids.has(p.id)))
          if (!sel) return
          if ('floor' in target) return get().moveSelection(moveToFloor(sel, target.floor))
          if (ids.has(target.partId)) return
          const on = get().project.parts.find((p) => p.id === target.partId)
          if (!on) return
          const { delta } = moveNextTo(sel, on, target.hit, target.normal)
          if (delta.some((v) => v !== 0)) get().moveSelection(delta)
        },
        setMultiSelect: (multiSelect) => set({ multiSelect, ...(multiSelect ? { measureMode: false, pendingPoint: null } : {}) }),
        setPlaceProfile: (placeProfile) =>
          set((s) => ({
            placeProfile,
            moveMode: false,
            rotateMode: false, mirrorMode: false,
            // Placing is building
            ...(placeProfile && s.settings.mode !== 'skissa' ? { settings: { ...s.settings, mode: 'skissa' as const } } : {}),
            placeNote: null,
            placeChoice: null,
            sheetCorner: null,
            ...(placeProfile ? { measureMode: false, pendingPoint: null, snapChoice: null, multiSelect: false } : {}),
          })),
        placeTap: (target) => {
          const profileId = get().placeProfile
          if (!profileId) return
          const parts = get().project.parts
          // Sheets: two taps, corner to corner
          if (getProfile(profileId).kind === 'sheet') {
            let point: Vec3
            let axis: 0 | 1 | 2 = 1
            let sign: 1 | -1 = 1
            if ('floor' in target) point = [...target.floor] as Vec3
            else {
              const n = target.normal
              axis = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))) as 0 | 1 | 2
              sign = n[axis] < 0 ? -1 : 1
              point = [...target.hit] as Vec3
            }
            // Off the snap points, round to the grid along the surface
            const grid = get().settings.snap
            if (grid > 0 && !('partId' in target && target.snapped))
              for (const i of [0, 1, 2]) if (i !== axis) point[i] = Math.round(point[i] / grid) * grid
            const corner = get().sheetCorner
            if (!corner) {
              set({ sheetCorner: { point, axis, sign }, placeNote: 'Tryck nu på motsatta hörnet', placeChoice: null })
              return
            }
            const placed = sheetBetween(profileId, corner, point)
            if (!placed) {
              set({ placeNote: 'För liten — tryck på motsatta hörnet en bit bort' })
              return
            }
            const prof = getProfile(profileId)
            const part: Part = { ...placed, id: uid(), name: `${prof.name} #${parts.filter((p) => p.profileId === profileId).length + 1}` }
            editParts((ps) => [...ps, part], [part.id])
            set({
              sheetCorner: null,
              placeChoice: null,
              placeNote: `${part.length} × ${part.width} mm lagd — tryck på nästa skivas första hörn, eller Klar`,
            })
            return
          }
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
          if (blocked()) return
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
        reorientSelection: () => {
          if (blocked()) return
          const { selection, project, placeChoice: c } = get()
          if (selection.length !== 1) return
          const id = selection[0]
          const part = project.parts.find((p) => p.id === id)
          if (!part) return
          // Keep cycling the same list while the board is where the last tap put it
          const continuing = c && c.partId === id && samePlacement(c.options[c.index].part, part)
          const options = continuing ? c.options : reorientOptions(part, project.parts)
          if (options.length < 2) return
          const current = continuing ? c.index : options.findIndex((o) => samePlacement(o.part, part))
          const index = (current + 1) % options.length
          const next = options[index]
          const apply = (ps: Part[]) => ps.map((p) => (p.id === id ? { ...p, ...next.part } : p))
          // The first tap is an undo step; further taps replace it, so one Ångra goes back
          if (continuing) set((s) => ({ project: { ...s.project, parts: apply(s.project.parts) } }))
          else editParts(apply, [id])
          set({ placeChoice: { partId: id, options, index }, placeNote: describePlacement(next) })
        },
        setMeasureMode: (on) =>
          set({
            ...(on ? { jointMode: false, jointDraft: null, scaleMode: false, scaleFace: null } : {}),
            moveMode: false,
            rotateMode: false, mirrorMode: false,
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
        resizeSelection: (axis, size) => {
          const { selection, project } = get()
          const ids = new Set(selection.length ? selection : project.parts.map((p) => p.id))
          const chosen = project.parts.filter((p) => ids.has(p.id))
          if (!chosen.length) return
          const changed =
            chosen.length === 1 ? [setSizeAlong(chosen[0], axis, size)] : stretchParts(chosen, axis, size)
          // A framed sheet that changed size or place gets its frame rebuilt from its
          // settings, so rails, joists and legs fit it exactly (legs stay in the corners)
          const rebuilt = changed.filter((p) => p.frame).map((p) => rebuildFrame(p)!)
          const sheets = new Set(rebuilt.map((r) => r.sheet.id))
          const byId = new Map(changed.map((p) => [p.id, p]))
          for (const r of rebuilt) byId.set(r.sheet.id, r.sheet)
          editParts((ps) => [
            ...ps.filter((p) => !(p.frameOf && sheets.has(p.frameOf))).map((p) => byId.get(p.id) ?? p),
            ...rebuilt.flatMap((r) => r.parts),
          ])
        },
        rotateSelection: (axis) =>
          editSelection((ps) => (ps.length === 1 ? [rotatePart(ps[0], axis)] : rotateParts(ps, axis))),
        rotateSelectionStep: (axis, dir) => editSelection((ps) => rotatePartsInPlace(ps, axis, dir)),
        rotateMode: false,
        setRotateMode: (rotateMode) =>
          set({
            rotateMode,
            ...(rotateMode ? { moveMode: false, mirrorMode: false, measureMode: false, placeProfile: null, pendingPoint: null } : {}),
          }),

        mirrorMode: false,
        setMirrorMode: (mirrorMode) =>
          set({
            mirrorMode,
            ...(mirrorMode ? { moveMode: false, rotateMode: false, measureMode: false, placeProfile: null, pendingPoint: null } : {}),
          }),
        mirrorSelection: (axis, copy) => {
          const src = selected()
          const box = unionBox(src)
          const all = unionBox(get().project.parts)
          if (!box || !all) return
          if (!copy) {
            const ids = new Set(src.map((p) => p.id))
            const flipped = new Map(mirrorParts(src, axis, (box.min[axis] + box.max[axis]) / 2).map((p) => [p.id, p]))
            editParts((ps) => ps.map((p) => (ids.has(p.id) ? flipped.get(p.id)! : p)), [...ids])
            return
          }
          const groupMap = new Map<string, Group>()
          for (const p of src)
            if (p.groupId && !groupMap.has(p.groupId)) {
              const g = get().project.groups.find((x) => x.id === p.groupId)
              groupMap.set(p.groupId, { id: uid(), name: `${g?.name ?? 'Grupp'} (spegel)` })
            }
          const newIds = new Map(src.map((p) => [p.id, uid()]))
          const copies = mirrorParts(src, axis, copyPlane(box, all, axis)).map((p) => ({
            ...p,
            id: newIds.get(p.id)!,
            name: src.length === 1 ? `${p.name} (spegel)` : p.name,
            groupId: p.groupId ? groupMap.get(p.groupId)!.id : undefined,
            frameOf: p.frameOf ? newIds.get(p.frameOf) : undefined,
            rip: p.rip ? { ...p.rip, id: `${p.rip.id}-m` } : undefined,
          }))
          edit(
            (snap) => ({ parts: [...snap.parts, ...copies], groups: [...snap.groups, ...groupMap.values()] }),
            copies.map((p) => p.id),
          )
        },

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
          const newIds = new Map(src.map((p) => [p.id, uid()]))
          const copies = moveParts(src, [0, 0, box.max[2] - box.min[2] + 50]).map((p) => ({
            ...p,
            id: newIds.get(p.id)!,
            name: src.length === 1 ? `${p.name} (kopia)` : p.name,
            groupId: p.groupId ? groupMap.get(p.groupId)!.id : undefined,
            // A copied frame belongs to the copied sheet, so its frame stays editable;
            // a frame board copied without its sheet becomes a plain board
            frameOf: p.frameOf ? newIds.get(p.frameOf) : undefined,
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
        reorderParts: (ids) =>
          editParts((ps) => {
            const set = new Set(ids)
            const byId = new Map(ps.map((p) => [p.id, p]))
            const queue = ids.filter((id) => byId.has(id))
            return ps.map((p) => (set.has(p.id) ? byId.get(queue.shift()!)! : p))
          }),
        setGroupOrder: (ids) =>
          edit((snap) => {
            const byId = new Map(snap.groups.map((g) => [g.id, g]))
            const first = ids.map((id) => byId.get(id)).filter((g): g is NonNullable<typeof g> => !!g)
            return { ...snap, groups: [...first, ...snap.groups.filter((g) => !ids.includes(g.id))] }
          }),

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
        switchButtJoints: () => {
          const r = switchButtJoints(get().selection, get().project.parts)
          if (!r) return
          const changed = new Map(r.parts.map((p) => [p.id, p]))
          editParts((ps) => ps.map((p) => changed.get(p.id) ?? p))
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
          !blocked() &&
          set((s) => {
            const prev = s.past[s.past.length - 1]
            if (!prev) return s
            return {
              ...restore(s, prev),
              past: s.past.slice(0, -1),
              future: [{ parts: s.project.parts, groups: s.project.groups, screwEdits: s.project.screwEdits }, ...s.future],
            }
          }),

        redo: () =>
          !blocked() &&
          set((s) => {
            const next = s.future[0]
            if (!next) return s
            return {
              ...restore(s, next),
              past: [...s.past, { parts: s.project.parts, groups: s.project.groups, screwEdits: s.project.screwEdits }],
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
        ownSheetSizes: {},
        setOwnSheetSizes: (category, sizes) =>
          set((s) => {
            const next = { ...s.ownSheetSizes }
            if (sizes?.length) next[category] = sizes
            else delete next[category]
            return { ownSheetSizes: next }
          }),
        ownStockLengths: {},
        setOwnStockLengths: (category, lengths) =>
          set((s) => {
            const next = { ...s.ownStockLengths }
            if (lengths?.length) next[category] = [...lengths].sort((a, b) => a - b)
            else delete next[category]
            return { ownStockLengths: next }
          }),

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
            mode: toPhase(p.settings?.mode),
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
        ownSheetSizes: s.ownSheetSizes,
        ownStockLengths: s.ownStockLengths,
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
