import type { PriceEntry, Profile, ProfileCategory } from './types'

export const CATEGORY_NAMES: Record<ProfileCategory, string> = {
  konstruktion: 'Konstruktionsvirke',
  hyvlat: 'Hyvlat virke',
  tryckimpregnerat: 'Tryckimpregnerat',
  lakt: 'Läkt',
  plywood: 'Plywood',
  mdf: 'MDF',
  osb: 'OSB',
}

export const SHEET_CATEGORIES: ProfileCategory[] = ['plywood', 'mdf', 'osb']

const KONSTR = [3000, 3600, 4200, 4800, 5400]
const HYVLAT = [2400, 3000, 3600, 4200, 4800]
const TRALL = [3000, 3600, 4200, 4800, 5400]
const LAKT = [3000, 3600, 4200, 4800]

function p(category: ProfileCategory, t: number, w: number, stockLengths: number[], color: string): Profile {
  return {
    id: `${category}-${t}x${w}`,
    name: `${t}x${w}`,
    kind: 'board',
    category,
    thickness: t,
    width: w,
    stockLengths,
    stockSheets: [],
    color,
  }
}

function sheet(category: ProfileCategory, t: number, stockSheets: [number, number][], color: string): Profile {
  return {
    id: `${category}-${t}`,
    name: `${CATEGORY_NAMES[category]} ${t} mm`,
    kind: 'sheet',
    category,
    thickness: t,
    width: 400,
    stockLengths: [],
    stockSheets,
    color,
  }
}

/** Short label for a catalog button: "45x70" or "18 mm". */
export const shortName = (prof: Profile) => (prof.kind === 'sheet' ? `${prof.thickness} mm` : prof.name)

// Stock sheet sizes vary by supplier and product; these are common sizes,
// to be replaced by scraped data.
const FULL_SHEET: [number, number][] = [[2440, 1220]]
const OSB_SHEET: [number, number][] = [[2400, 1200]]

// Common Swedish dimensions, checked against what Bauhaus sells (2026-11-16).
// Stock lengths/sizes here are only a fallback: when a supplier price file has
// a profile, its real lengths and sheet sizes are used instead.
export const PROFILES: Profile[] = [
  ...[45, 70, 95, 120, 145, 170, 195, 220].map((w) => p('konstruktion', 45, w, KONSTR, '#e2c08d')),
  ...[45, 70, 95, 120, 145].map((w) => p('hyvlat', 21, w, HYVLAT, '#f0d9b0')),
  ...[70, 95, 120].map((w) => p('hyvlat', 28, w, HYVLAT, '#f0d9b0')),
  ...[70, 95].map((w) => p('hyvlat', 34, w, HYVLAT, '#f0d9b0')),
  ...[
    [22, 95],
    [22, 120],
    [28, 70],
    [28, 95],
    [28, 120],
    [28, 145],
    [34, 145],
    [45, 95],
    [45, 145],
    [45, 220],
  ].map(([t, w]) => p('tryckimpregnerat', t, w, TRALL, '#a9b77f')),
  ...[
    [22, 45],
    [25, 38],
    [25, 48],
    [28, 45],
  ].map(([t, w]) => p('lakt', t, w, LAKT, '#d8b98a')),
  ...[4, 7, 9, 12, 15, 18, 21].map((t) => sheet('plywood', t, FULL_SHEET, '#ecd4a6')),
  ...[6, 8, 10, 12, 16, 19, 22, 25].map((t) => sheet('mdf', t, FULL_SHEET, '#b88f62')),
  ...[9, 11, 12, 15, 18, 22].map((t) => sheet('osb', t, OSB_SHEET, '#d4ad6c')),
]

const BY_ID = new Map(PROFILES.map((x) => [x.id, x]))

export function getProfile(id: string): Profile {
  const prof = BY_ID.get(id)
  if (!prof) throw new Error(`Okänd profil: ${id}`)
  return prof
}

/**
 * Placeholder prices so the shopping list has something to show before the
 * scraper exists. NOT real supplier prices — shown as "Exempel" in the UI.
 */
export const EXAMPLE_PRICES: PriceEntry[] = PROFILES.map((prof) => {
  if (prof.kind === 'sheet') {
    const perMm = prof.category === 'plywood' ? 42 : prof.category === 'mdf' ? 24 : 20
    return { profileId: prof.id, supplier: 'Exempel', unit: 'st' as const, price: prof.thickness * perMm }
  }
  const areaCm2 = (prof.thickness * prof.width) / 100
  const base = prof.category === 'hyvlat' ? 0.9 : prof.category === 'tryckimpregnerat' ? 0.75 : 0.6
  return {
    profileId: prof.id,
    supplier: 'Exempel',
    unit: 'lm' as const,
    price: Math.round(areaCm2 * base * 10) / 10,
  }
})
