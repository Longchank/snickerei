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
