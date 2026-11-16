/**
 * Fetch current lumber and sheet prices from Bauhaus and write
 * public/prices/bauhaus.json. Run with `npm run prices`.
 *
 * Polite by design: category pages only (allowed by robots.txt), one request
 * at a time with a pause between, a handful of pages in total.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import type { ScrapedProduct, SupplierPriceFile } from '../src/lib/types'
import { parseCategoryPage, SOURCES, toProduct, WEBSITE } from './suppliers/bauhaus'

const DELAY_MS = 2000
const USER_AGENT = 'Mozilla/5.0 (compatible; price-fetcher/0.1)'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'sv-SE' } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.text()
}

async function main() {
  const products = new Map<string, ScrapedProduct>()
  const skipped: Record<string, string[]> = {}
  let requests = 0

  for (const source of SOURCES) {
    let pages = 1
    for (let page = 1; page <= pages; page++) {
      if (requests++ > 0) await sleep(DELAY_MS)
      const url = `${WEBSITE}${source.path}${page > 1 ? `?p=${page}` : ''}`
      const html = await get(url)
      const parsed = parseCategoryPage(html, source.path)
      pages = Math.min(parsed.pages, 10)
      console.log(`${url}: ${parsed.cards.length} produkter (sida ${page}/${pages})`)
      for (const card of parsed.cards) {
        const p = toProduct(card, source)
        if ('skipped' in p) (skipped[p.skipped] ??= []).push(card.name)
        else if (!products.has(p.sku)) products.set(p.sku, p)
      }
    }
  }

  if (products.size < 20) throw new Error(`Bara ${products.size} produkter hittades — har sidan ändrats?`)

  const file: SupplierPriceFile = {
    supplier: 'Bauhaus',
    website: WEBSITE,
    fetchedAt: new Date().toISOString(),
    products: [...products.values()].sort(
      (a, b) => a.category.localeCompare(b.category) || a.thickness - b.thickness || a.width - b.width || a.length - b.length,
    ),
  }
  await mkdir('public/prices', { recursive: true })
  await writeFile('public/prices/bauhaus.json', JSON.stringify(file, null, 1) + '\n')
  console.log(`\n${products.size} produkter sparade i public/prices/bauhaus.json (${requests} anrop)`)
  for (const [reason, names] of Object.entries(skipped)) {
    console.log(`Hoppade över ${names.length} (${reason})`)
    if (process.env.VERBOSE) names.forEach((n) => console.log(`  ${n}`))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
