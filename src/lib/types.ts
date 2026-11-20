/** All lengths are in millimetres. */

export type ProfileCategory =
  | 'konstruktion'
  | 'hyvlat'
  | 'tryckimpregnerat'
  | 'lakt'
  | 'plywood'
  | 'mdf'
  | 'osb'

/**
 * A material a part is made from.
 * - 'board': lumber with a fixed cross-section. Only length can change — a
 *   45x70 is always 45x70.
 * - 'sheet': sheet goods (plywood, MDF, OSB) with a fixed thickness. Length
 *   and width are free, up to the stock sheet size.
 */
export interface Profile {
  id: string
  name: string
  kind: 'board' | 'sheet'
  category: ProfileCategory
  /** Smaller cross-section dimension, e.g. 45 in 45x70; sheet thickness */
  thickness: number
  /** Board: larger cross-section dimension (70 in 45x70). Sheet: default width of a new part */
  width: number
  /** Boards: lengths the board is sold in */
  stockLengths: number[]
  /** Sheets: [length, width] of the sheets sold */
  stockSheets: [number, number][]
  color: string
}

/** Quarter turns (0–3) around X, Y and Z. Parts are always axis-aligned. */
export type QuarterTurns = [number, number, number]

export type Vec3 = [number, number, number]

/**
 * A placed board. Local geometry: length along X, thickness along Y,
 * width along Z, with the origin at one corner (spans 0..L, 0..T, 0..W).
 */
export interface Part {
  /** Hidden in the 3D view (still counted in lists, screws and analysis) */
  hidden?: boolean
  /** Locked: can't be selected (so not moved, changed or deleted); still a target for placing and measuring */
  locked?: boolean
  /** A sheet with a frame built under it: the frame's settings */
  frame?: SheetFrame
  /** A frame board generated under this sheet (its id) */
  frameOf?: string
  /** Own load on this part for the strength analysis, kg (replaces the purpose preset there) */
  loadKg?: number
  id: string
  name: string
  profileId: string
  length: number
  /** Sheets only: the part's width. Boards always use the profile width. */
  width?: number
  position: Vec3
  rotation: QuarterTurns
  /** Assembly this part belongs to */
  groupId?: string
  /** Material removed from the part (joints), in the part's local coordinates */
  notches?: Notch[]
  /** Angled cuts at the start (x = 0) and end (x = length); null/absent = square */
  ends?: [EndCut | null, EndCut | null]
  /** This part is one half of a board ripped lengthwise at an angle (French cleat) */
  rip?: Rip
  /**
   * Sheets with a grain (plywood, OSB): which way the face grain must run,
   * relative to the part's length. Absent = any direction.
   */
  grain?: 'length' | 'width'
}

/**
 * An angled end cut. The part's length is measured on the long side.
 * - 'face': miter seen on the wide face (cut through the thickness), like a picture frame
 * - 'edge': miter seen on the narrow face (cut through the width), sawn with
 *   the board on edge ("på högkant")
 * angle: degrees from square; the sign picks which side keeps the long point
 * (positive: the long point is on the side at local z = 0 / y = 0).
 */
export interface EndCut {
  plane: 'face' | 'edge'
  angle: number
}

/** One of two pieces from ripping a part lengthwise at an angle through its thickness. */
export interface Rip {
  /** Shared by both halves */
  id: string
  half: 0 | 1
  /** Degrees from square to the face; 45 for a French cleat */
  angle: number
  /** Saw blade width when ripped */
  kerf: number
}

/** An axis-aligned box cut out of a part, in its local coordinates (0..L, 0..T, 0..W). */
export interface Notch {
  min: Vec3
  max: Vec3
  kind: 'urtag' | 'halvt'
  /** Name of the part this joint is with, for the cut list */
  withName?: string
}

/** A named assembly of parts, e.g. "Ben" or "Sits". */
export interface Group {
  id: string
  name: string
}

/** "Ram under skivan" settings */
export interface SheetFrame {
  profileId: string
  /** Joists (tvärreglar) between the end rails */
  joists: number
  /** Boards on edge (högkant) or flat */
  onEdge: boolean
  /** Legs at the four corners, down to the floor */
  legs?: FrameLegs
  /** The long way the rails run (x or z), fixed when the frame is first built */
  axis?: 0 | 2
  /** Joists (1…joists) the sheet is split over, so it can be cut from smaller store sheets */
  seams?: number[]
}

/** Where the legs go relative to the frame */
export type LegPlacement = 'inside' | 'outside' | 'under' | 'merged'

export interface FrameLegs {
  profileId: string
  placement: LegPlacement
  /** Height of the sheet's top above the floor, mm */
  height: number
  /** Outside legs only: the sheet is widened to cover them */
  cover?: boolean
  /** Outside legs only: beside the long rails (default) or beside the end rails */
  side?: 'long' | 'short'
}

/** What the build is for: picks the load preset for the strength analysis */
export type Purpose = 'bokhylla' | 'forvaring' | 'bord' | 'bank' | 'arbetsbank'

export interface Project {
  name: string
  parts: Part[]
  groups: Group[]
  /** Measurements the user has made with the measuring tool */
  measurements: Measurement[]
  /** What it's for (Analys); unset = Förvaring */
  purpose?: Purpose
}

/** A point picked on a surface (or the floor) and which way that surface faces. */
export interface MeasurePoint {
  point: Vec3
  /** Axis of the surface normal: 0 = x, 1 = y (up), 2 = z */
  axis: 0 | 1 | 2
  /** Picked on the floor rather than on a part */
  floor: boolean
  /** What the point snapped to; absent = the plain tapped spot */
  snap?: SnapKind
}

export interface Measurement {
  id: string
  a: MeasurePoint
  b: MeasurePoint
}

/**
 * One price observation. Written by hand ("Egen") or by a supplier scraper.
 * - 'lm': per running metre (boards); only for `length` when given
 * - 'st': per piece; for boards at `length`, for sheets at `length` x `width`
 *   (or any size when omitted)
 * - 'm2': per square metre (sheets)
 * Entries with a length (and width) also tell us which stock sizes exist.
 */
export interface PriceEntry {
  profileId: string
  supplier: string
  unit: 'lm' | 'st' | 'm2'
  length?: number
  width?: number
  /** SEK incl. VAT */
  price: number
  url?: string
  /** Product name at the supplier */
  name?: string
  fetchedAt?: string
}

export interface Settings {
  /** Grid snap when moving parts, mm */
  snap: number
  /** Saw blade width, mm */
  kerf: number
  /** Show dimension lines in the 3D view */
  showDimensions: boolean
  /** Snap to other parts' faces while moving */
  snapToParts: boolean
  /** Which features to snap to, when moving parts and when measuring */
  snapTypes: SnapTypes
  /** Bygg: taps pick whole groups, several at a time. Redigera: one part, its details. */
  mode: 'bygg' | 'redigera'
  /** Advanced: the free 3D drag gizmo (off by default) */
  freeMove: boolean
  /** How far one tap on a move arrow moves the selection, mm */
  moveStep: number
}

export interface SnapTypes {
  /** Corners */
  vertex: boolean
  /** Edge midpoints and points along edges */
  edge: boolean
  /** Faces: face centres when measuring, face to face when moving */
  face: boolean
  /** Centre of a part */
  center: boolean
}

/** What a measuring point snapped to */
export type SnapKind = 'vertex' | 'edgeMid' | 'faceCenter' | 'center' | 'edge' | 'face'

/** A product as collected from a supplier's website. Sizes in mm, price in SEK incl. VAT per piece. */
export interface ScrapedProduct {
  sku: string
  name: string
  url: string
  kind: 'board' | 'sheet'
  /** Our category, e.g. 'konstruktion' or 'plywood' */
  category: ProfileCategory
  thickness: number
  /** Board: cross-section width. Sheet: the shorter side. */
  width: number
  /** Board: length. Sheet: the longer side. */
  length: number
  price: number
}

/** public/prices/<supplier>.json */
export interface SupplierPriceFile {
  supplier: string
  website: string
  fetchedAt: string
  products: ScrapedProduct[]
}
