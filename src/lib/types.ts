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
  /** Assembly this part belongs to */
  groupId?: string
  /** Material removed from the part (joints), in the part's local coordinates */
  notches?: Notch[]
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

export interface Project {
  name: string
  parts: Part[]
  groups: Group[]
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
}

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
