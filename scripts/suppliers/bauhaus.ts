import { parse } from 'node-html-parser'
import type { ProfileCategory, ScrapedProduct } from '../../src/lib/types'

export const WEBSITE = 'https://www.bauhaus.se'

export interface Source {
  path: string
  kind: 'board' | 'sheet'
  /** Fixed category for every product on the page; null = decide per product */
  category: ProfileCategory | null
  /** Only keep pressure-treated products (the decking page also lists hardwoods and composites) */
  treatedOnly?: boolean
}

// Category pages only — robots.txt allows these and their ?p= pagination,
// and disallows /api/, search and other query strings.
export const SOURCES: Source[] = [
  { path: '/bygg/tra/obehandlat-virke/konstruktionsvirke', kind: 'board', category: null },
  { path: '/bygg/tra/obehandlat-virke/planhyvlat', kind: 'board', category: null },
  { path: '/bygg/tra/lakt', kind: 'board', category: 'lakt' },
  { path: '/bygg/tra/trycktvirke/trallvirke', kind: 'board', category: 'tryckimpregnerat', treatedOnly: true },
  { path: '/bygg/skivmaterial/plywood', kind: 'sheet', category: 'plywood' },
  { path: '/bygg/skivmaterial/mdf', kind: 'sheet', category: 'mdf' },
  { path: '/bygg/skivmaterial/osb', kind: 'sheet', category: 'osb' },
]

export interface Card {
  sku: string
  name: string
  url: string
  /** Price per piece */
  price: number
  /** Price as displayed, e.g. "30,75 kr/M" */
  displayPrice: string
}

/** Product cards and the number of result pages on a category page. */
export function parseCategoryPage(html: string, path: string): { cards: Card[]; pages: number } {
  const root = parse(html)
  const cards: Card[] = []
  for (const a of root.querySelectorAll('a[data-product-link]')) {
    const price = Number(a.getAttribute('data-price'))
    const name = a.getAttribute('data-name')?.trim()
    const url = a.getAttribute('href')
    if (!name || !url || !Number.isFinite(price) || price <= 0) continue
    cards.push({
      sku: a.getAttribute('data-id') ?? url,
      name,
      url,
      price,
      displayPrice: a.querySelector('[data-price-type="finalPrice"]')?.text.replace(/\s+/g, ' ').trim() ?? '',
    })
  }
  const pageNums = [...html.matchAll(new RegExp(`${path.replace(/[/-]/g, '\\$&')}\\?p=(\\d+)`, 'g'))].map((m) =>
    Number(m[1]),
  )
  return { cards, pages: Math.max(1, ...pageNums) }
}

const num = (s: string) => Number(s.replace(',', '.'))

/**
 * Read thickness x width x length (mm) from a product name such as
 * "REGEL VIDA 45X95X3000MM", "LÄKT VIDA G4-3 25X38MM 4.2M",
 * "TRÄKANTSLÄKT VIDA G4-2 45X45 3,9M" or "MDF SKIVA BRUN 19MM 1220X2440MM".
 */
export function parseDimensions(rawName: string): [number, number, number] | null {
  const name = rawName.toUpperCase().replace(/XMM/g, 'MM')
  const n = '(\\d+(?:[.,]\\d+)?)'
  let m = name.match(new RegExp(`${n}\\s*X\\s*${n}\\s*X\\s*${n}(?:\\s*MM|\\b)`))
  if (m) return [num(m[1]), num(m[2]), num(m[3])]
  m = name.match(new RegExp(`${n}\\s*X\\s*${n}(?:\\s*MM)?[\\s-]+${n}\\s*(MM|M)\\b`))
  if (m) return [num(m[1]), num(m[2]), m[4] === 'M' ? Math.round(num(m[3]) * 1000) : num(m[3])]
  m = name.match(new RegExp(`${n}\\s*MM[\\s-]+${n}\\s*X\\s*${n}\\s*MM`))
  if (m) return [num(m[1]), num(m[2]), num(m[3])]
  return null
}

/** Words that mark products in these categories that aren't plain stock material. */
const EXCLUDE = /\bLIST\b|LISTER|FÖRPACK|\d+\s*ST\b|\bPANEL\b|HYLLPLAN|BÄNKSKIVA|FÄRDIG|KAPAD|TREKANT/

export function toProduct(card: Card, source: Source): ScrapedProduct | { skipped: string } {
  const name = card.name.toUpperCase()
  if (EXCLUDE.test(name)) return { skipped: 'not stock material' }
  const dims = parseDimensions(name)
  if (!dims) return { skipped: 'no dimensions in name' }

  if (source.kind === 'sheet') {
    const [t, a, b] = dims
    return {
      sku: card.sku,
      name: card.name,
      url: card.url,
      kind: 'sheet',
      category: source.category!,
      thickness: t,
      width: Math.min(a, b),
      length: Math.max(a, b),
      price: card.price,
    }
  }

  const [a, b] = dims
  // A lumber cross-section is small; "2400X58X58" (a glulam post, length first) isn't one
  if (a > 300 || b > 300) return { skipped: 'not a lumber cross-section' }
  // "5,4MM" on a 5.4 m board is a typo on the site: tiny lengths are metres
  const length = dims[2] < 100 ? Math.round(dims[2] * 1000) : dims[2]
  if (length < 1500 || length > 7200) return { skipped: 'implausible length' }
  const treated = /TRYCKIMPREGNERAD|\bNTR\b/.test(name)
  if (source.treatedOnly && !treated) return { skipped: 'not pressure-treated' }
  const category: ProfileCategory = treated ? 'tryckimpregnerat' : (source.category ?? guessBoardCategory(Math.min(a, b)))
  return {
    sku: card.sku,
    name: card.name,
    url: card.url,
    kind: 'board',
    category,
    thickness: Math.min(a, b),
    width: Math.max(a, b),
    length,
    price: card.price,
  }
}

/** Structural timber is 45 mm thick; thinner boards in these categories are planed. */
function guessBoardCategory(thickness: number): ProfileCategory {
  return thickness >= 45 ? 'konstruktion' : 'hyvlat'
}
