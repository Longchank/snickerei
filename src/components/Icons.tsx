/**
 * Icons (owner 2026-11-24): common functions use Lucide (lucide-react, ISC
 * licence) — thin round line icons, the style of the owner's reference
 * picture. Woodworking-specific functions (boards, screws, joints, ends,
 * frames …) get icons the owner draws; until then they keep their current
 * glyphs. The step buttons stay as plain numbers.
 *
 * `Ic` is the one way to draw a Lucide icon: same stroke everywhere, sized
 * to the text (1.15em) unless a size is given, hidden from screen readers
 * (the button carries the label).
 */
import type { ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Copy,
  Crosshair,
  Expand,
  Eye,
  EyeOff,
  FileInput,
  FileOutput,
  FilePlus,
  FlipHorizontal,
  FlipVertical2,
  Focus,
  Footprints,
  Group,
  History,
  Info,
  ListChecks,
  ListOrdered,
  Lock,
  LockOpen,
  Magnet,
  Menu,
  Minus,
  Move,
  MoveDiagonal,
  MoveHorizontal,
  MoveVertical,
  Palette,
  Pencil,
  Plus,
  Printer,
  Redo2,
  Repeat2,
  RotateCw,
  Ruler,
  RulerDimensionLine,
  ScanEye,
  ScanSearch,
  SlidersHorizontal,
  SquareDashedMousePointer,
  Tag,
  Trash2,
  TriangleAlert,
  Undo2,
  Ungroup,
  WandSparkles,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'

export const STROKE = 1.75

/** A Lucide icon in the app's style */
export function Ic({ i: I, size, className }: { i: LucideIcon; size?: number; className?: string }) {
  return <I className={`ic ${className ?? ''}`} size={size ?? '1.15em'} strokeWidth={STROKE} absoluteStrokeWidth={false} aria-hidden />
}

/** The Lucide icons the app uses, by function */
export const L = {
  undo: Undo2,
  redo: Redo2,
  menu: Menu,
  newProject: FilePlus,
  print: Printer,
  export: FileOutput,
  import: FileInput,
  dims: RulerDimensionLine,
  freeMove: Move,
  snap: Magnet,
  add: Plus,
  steps: ListOrdered,
  cut: ListChecks,
  check: ClipboardCheck,
  lists: ClipboardList,
  prices: Tag,
  fit: ScanSearch,
  fullscreen: Expand,
  tools: SlidersHorizontal,
  close: X,
  measure: Ruler,
  stepByStep: Footprints,
  xray: ScanEye,
  hide: EyeOff,
  show: Eye,
  isolate: Focus,
  lock: Lock,
  unlock: LockOpen,
  group: Group,
  ungroup: Ungroup,
  move: Move,
  rotate: RotateCw,
  mirror: FlipVertical2,
  flipInPlace: FlipHorizontal,
  copy: Copy,
  trash: Trash2,
  selectSimilar: SquareDashedMousePointer,
  otherDirection: Repeat2,
  axisSide: MoveHorizontal,
  axisDepth: MoveDiagonal,
  axisHeight: MoveVertical,
  smartest: WandSparkles,
  flip: ArrowUpDown,
  colour: Palette,
  edit: Pencil,
  up: ArrowUp,
  down: ArrowDown,
  reset: History,
  minus: Minus,
  plus: Plus,
  ok: Check,
  prev: ChevronLeft,
  next: ChevronRight,
  showIn3d: Crosshair,
  fix: Wrench,
  info: Info,
  warning: TriangleAlert,
} satisfies Record<string, LucideIcon>

const tool = (i: LucideIcon) => () => <Ic i={i} size={22} className="tool-icon" />

// The 3D view's tool menu and the Bygg action bar (names kept from before)
export const IconTools = tool(L.tools)
export const IconClose = tool(L.close)
export const IconRuler = tool(L.measure)
export const IconSteps = tool(L.stepByStep)
export const IconXray = tool(L.xray)
export const IconHide = tool(L.hide)
export const IconShow = tool(L.show)
export const IconIsolate = tool(L.isolate)
export const IconLock = tool(L.lock)
export const IconUnlock = tool(L.unlock)
export const IconGroup = tool(L.group)
export const IconUngroup = tool(L.ungroup)
export const IconMove = tool(L.move)
export const IconRotate = tool(L.rotate)
export const IconMirror = tool(L.mirror)
export const IconCopy = tool(L.copy)
export const IconTrash = tool(L.trash)

/** Woodworking-specific: drawn by hand until the owner's own icon arrives */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg className="tool-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}

export const IconScrew = () => (
  <Svg>
    <path d="M7 4h10" />
    <path d="M9 4v2h6V4" />
    <path d="M10 6v11l2 4 2-4V6" />
    <path d="M10 9l4 1.5M10 12l4 1.5M10 15l4 1.5" />
  </Svg>
)

/**
 * End cuts drawn for the owner (2026-11-24): a 45×45 board with its sawn end
 * towards the viewer — Rak (cross cut), Gering (miter, across the width),
 * Högkant (bevel, across the thickness). The sawn face is tinted and shows
 * end grain. Thinner lines than Lucide on purpose (owner's choice).
 */
const CUT_PATHS = {
  rak: { outline: 'M6.82 19.98 L6.82 14.99 L21.50 6.52 L21.50 11.50Z M2.50 12.50 L6.82 14.99 L21.50 6.52 L17.18 4.02Z', cut: 'M2.50 17.48 L6.82 19.98 L6.82 14.99 L2.50 12.50Z', rings: 'M4.44 18.01 L4.42 17.74 L4.37 17.45 L4.27 17.16 L4.14 16.87 L3.98 16.60 L3.80 16.34 L3.59 16.11 L3.37 15.92 L3.15 15.76 M5.52 18.63 L5.49 18.13 L5.38 17.61 L5.20 17.08 L4.97 16.55 L4.67 16.04 L4.34 15.57 L3.96 15.15 L3.56 14.80 L3.15 14.52' },
  face: { outline: 'M10.55 17.48 L10.55 13.77 L21.50 7.44 L21.50 11.16Z M2.50 14.70 L10.55 13.77 L21.50 7.44 L18.28 5.59Z', cut: 'M2.50 18.41 L10.55 17.48 L10.55 13.77 L2.50 14.70Z', rings: 'M6.12 17.55 L6.09 17.36 L5.98 17.19 L5.80 17.03 L5.56 16.90 L5.26 16.79 L4.92 16.72 L4.53 16.69 L4.13 16.68 L3.71 16.71 M8.14 17.32 L8.07 16.97 L7.87 16.65 L7.54 16.36 L7.10 16.12 L6.55 15.93 L5.92 15.80 L5.22 15.73 L4.48 15.73 L3.71 15.78' },
  edge: { outline: 'M5.83 19.41 L10.17 13.06 L21.50 6.52 L21.50 10.36Z M6.83 11.13 L10.17 13.06 L21.50 6.52 L18.17 4.59Z', cut: 'M2.50 17.48 L5.83 19.41 L10.17 13.06 L6.83 11.13Z', rings: 'M4.52 17.59 L4.73 17.25 L4.90 16.90 L5.04 16.56 L5.12 16.23 L5.16 15.92 L5.15 15.65 L5.08 15.42 L4.97 15.24 L4.82 15.11 M5.35 18.07 L5.74 17.45 L6.06 16.81 L6.30 16.18 L6.46 15.58 L6.52 15.02 L6.50 14.52 L6.39 14.09 L6.19 13.76 L5.90 13.52' },
} as const

export function CutIcon({ kind, size = 32 }: { kind: 'rak' | 'face' | 'edge'; size?: number }) {
  const p = CUT_PATHS[kind]
  return (
    <svg className="ic cut-icon" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={p.outline} />
      <path d={p.cut} fill="currentColor" fillOpacity={0.12} />
      <path d={p.rings} strokeWidth={0.225} />
    </svg>
  )
}
