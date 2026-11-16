import { PROFILES } from './catalog'
import type { PriceEntry, SupplierPriceFile } from './types'

const PROFILE_IDS = new Set(PROFILES.map((p) => p.id))

/**
 * Turn a supplier's product list into price entries for the profiles in our
 * catalog. Products in sizes we don't stock are left out.
 */
export function supplierEntries(file: SupplierPriceFile): PriceEntry[] {
  const entries: PriceEntry[] = []
  for (const p of file.products) {
    const profileId = p.kind === 'sheet' ? `${p.category}-${p.thickness}` : `${p.category}-${p.thickness}x${p.width}`
    if (!PROFILE_IDS.has(profileId)) continue
    entries.push({
      profileId,
      supplier: file.supplier,
      unit: 'st',
      length: p.length,
      ...(p.kind === 'sheet' ? { width: p.width } : {}),
      price: p.price,
      url: p.url,
      name: p.name,
      fetchedAt: file.fetchedAt,
    })
  }
  return entries
}

/**
 * Prices in effect, per profile: your own price wins, then supplier prices,
 * then (if enabled) the example prices.
 */
export function mergePrices(own: PriceEntry[], suppliers: PriceEntry[], examples: PriceEntry[]): PriceEntry[] {
  const hasOwn = new Set(own.map((e) => e.profileId))
  const fromSuppliers = suppliers.filter((e) => !hasOwn.has(e.profileId))
  const covered = new Set([...hasOwn, ...fromSuppliers.map((e) => e.profileId)])
  return [...own, ...fromSuppliers, ...examples.filter((e) => !covered.has(e.profileId))]
}
