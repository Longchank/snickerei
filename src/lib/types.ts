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
  id: string
  name: string
  profileId: string
  length: number
  /** Sheets only: the part's width. Boards always use the profile width. */
  width?: number
  position: Vec3
  rotation: QuarterTurns
}

export interface Project {
  name: string
  parts: Part[]
}

/**
 * One price observation. Written by hand ("Egen") or by a supplier scraper.
 * - 'lm': per running metre (boards)
 * - 'st': per piece; for boards at `length`, for sheets at `length` x `width`
 *   (or any stock size when omitted)
 * - 'm2': per square metre (sheets)
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
}
