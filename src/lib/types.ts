/** All lengths are in millimetres. */

export type ProfileCategory = 'konstruktion' | 'hyvlat' | 'tryckimpregnerat' | 'lakt'

/**
 * A lumber profile: a fixed cross-section. A part made from a profile can only
 * change length — a 45x70 is always 45x70.
 */
export interface Profile {
  id: string
  name: string
  category: ProfileCategory
  /** Smaller cross-section dimension, e.g. 45 in 45x70 */
  thickness: number
  /** Larger cross-section dimension, e.g. 70 in 45x70 */
  width: number
  /** Lengths the board is sold in */
  stockLengths: number[]
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
  position: Vec3
  rotation: QuarterTurns
}

export interface Project {
  name: string
  parts: Part[]
}

/**
 * One price observation. Written by hand ("egen") or by a supplier scraper.
 * Either a price per running metre ('lm') or per piece at a given length ('st').
 */
export interface PriceEntry {
  profileId: string
  supplier: string
  unit: 'lm' | 'st'
  /** Required when unit is 'st' */
  length?: number
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
}
