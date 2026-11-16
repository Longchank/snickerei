import type { PriceEntry, Profile, ProfileCategory } from './types'

export const CATEGORY_NAMES: Record<ProfileCategory, string> = {
  konstruktion: 'Konstruktionsvirke C24',
  hyvlat: 'Hyvlat virke',
  tryckimpregnerat: 'Tryckimpregnerat',
  lakt: 'Läkt',
}

const KONSTR = [3000, 3600, 4200, 4800, 5400]
const HYVLAT = [2400, 3000, 3600, 4200, 4800]
const TRALL = [3000, 3600, 4200, 4800, 5400]
const LAKT = [3000, 3600, 4200, 4800]

function p(category: ProfileCategory, t: number, w: number, stockLengths: number[], color: string): Profile {
  return { id: `${category}-${t}x${w}`, name: `${t}x${w}`, category, thickness: t, width: w, stockLengths, color }
}

// Common Swedish dimensions. Stock lengths vary by supplier — the scraper is
// meant to replace these with real data.
export const PROFILES: Profile[] = [
  ...[45, 70, 95, 120, 145, 170, 195, 220].map((w) => p('konstruktion', 45, w, KONSTR, '#e2c08d')),
  ...[45, 70, 95, 120, 145].map((w) => p('hyvlat', 21, w, HYVLAT, '#f0d9b0')),
  ...[70, 95, 120].map((w) => p('hyvlat', 28, w, HYVLAT, '#f0d9b0')),
  p('tryckimpregnerat', 28, 120, TRALL, '#a9b77f'),
  p('tryckimpregnerat', 34, 145, TRALL, '#a9b77f'),
  p('tryckimpregnerat', 45, 95, TRALL, '#a9b77f'),
  p('tryckimpregnerat', 45, 145, TRALL, '#a9b77f'),
  p('lakt', 25, 48, LAKT, '#d8b98a'),
  p('lakt', 34, 70, LAKT, '#d8b98a'),
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
  const areaCm2 = (prof.thickness * prof.width) / 100
  const base = prof.category === 'hyvlat' ? 0.9 : prof.category === 'tryckimpregnerat' ? 0.75 : 0.6
  return {
    profileId: prof.id,
    supplier: 'Exempel',
    unit: 'lm' as const,
    price: Math.round(areaCm2 * base * 10) / 10,
  }
})
