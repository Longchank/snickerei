import { describe, expect, it } from 'vitest'
import { parseCategoryPage, parseDimensions, SOURCES, toProduct, type Card } from './bauhaus'

// Real product names from bauhaus.se (2026-11-16)
describe('parseDimensions', () => {
  it.each([
    ['REGEL VIDA 45X95X3000MM', [45, 95, 3000]],
    ['REGEL SCA C24 OBEHANDLAD 45X145X5400MM', [45, 145, 5400]],
    ['LÄKT VIDA G4-3 25X38MM 4.2M', [25, 38, 4200]],
    ['LÄKT VIDA G4-3 25X38MM 3,6M', [25, 38, 3600]],
    ['LÄKT VIDA OHYVLAT G4-3 25X48MM 4200MM', [25, 48, 4200]],
    ['REGEL SCA FINGERSKARVAD 45X45MM 2,5M', [45, 45, 2500]],
    ['TRALL VIDA TRYCKIMPREGNERAD G4-2 28X120MM 3,6M', [28, 120, 3600]],
    ['TRALL PREMIUM 28X120XMM 3,9M NTR/AB G4-2', [28, 120, 3900]],
    ['MDF SKIVA LJUNGBERG FRITZOE BRUN 19MM 1220X2440MM', [19, 1220, 2440]],
    ['MDF SKIVA LJUNGBERG FRITZOE 10MM 10X1220X2440MM', [10, 1220, 2440]],
    ['KONSTRUKTIONSPLYWOOD MOELVEN GRAN 15X900X2500MM', [15, 900, 2500]],
    ['OSB-SKIVA 11X1197X2500MM', [11, 1197, 2500]],
    ['FORMPLYWOOD 18X1200X2500 BASIC TWIN', [18, 1200, 2500]],
  ])('%s', (name, dims) => expect(parseDimensions(name)).toEqual(dims))

  it('returns null without dimensions', () => expect(parseDimensions('PLYWOOD BJÖRK')).toBeNull())
})

const card = (name: string, displayPrice = '10,00 kr/M', price = 30): Card => ({
  sku: '1',
  name,
  url: 'https://www.bauhaus.se/x',
  price,
  displayPrice,
})
const src = (path: string) => SOURCES.find((s) => s.path.endsWith(path))!

describe('toProduct', () => {
  it('classifies lumber by thickness and treatment', () => {
    expect(toProduct(card('REGEL VIDA 45X70X3000MM'), src('konstruktionsvirke'))).toMatchObject({
      category: 'konstruktion',
      thickness: 45,
      width: 70,
      length: 3000,
    })
    expect(toProduct(card('REGEL VIDA 28X70X3600MM'), src('planhyvlat'))).toMatchObject({ category: 'hyvlat' })
    expect(toProduct(card('REGEL VIDA 45X220X3600MM TRYCKIMPREGNERAD'), src('konstruktionsvirke'))).toMatchObject({
      category: 'tryckimpregnerat',
    })
  })

  it('reads a sheet as thickness + shorter side + longer side', () => {
    expect(toProduct(card('OSB-SKIVA 18X1250X2500MM', '599,00 kr', 599), src('osb'))).toMatchObject({
      kind: 'sheet',
      thickness: 18,
      width: 1250,
      length: 2500,
      price: 599,
    })
  })

  it('keeps lumber listed per piece', () => {
    expect(
      toProduct(card('LÄKT VIDA 25X50MM 4,2M TRYCKIMPREGNERAD', '49,90 kr', 49.9), src('lakt')),
    ).toMatchObject({ category: 'tryckimpregnerat', thickness: 25, width: 50, length: 4200, price: 49.9 })
  })

  it('fixes "5,4MM" meaning 5.4 m', () => {
    expect(toProduct(card('TRALL 22X95MM 5,4MM NTR/AB G4-2'), src('trallvirke'))).toMatchObject({ length: 5400 })
  })

  it('skips things that are not plain stock material', () => {
    for (const [name, source] of [
      ['TREKANTSLÄKT VIDA G4-2 45X45 3,9M', 'lakt'],
      ['TRALL GUYANA TEAK DECKING 25X140X1830MM', 'trallvirke'],
      ['MDF HYLLPLAN LJUNGBERG FRITZOE 19X300X2440MM', 'mdf'],
      ['LIMTRÄSTOLPE FURU 2400X58X58MM', 'planhyvlat'],
    ] as const)
      expect(toProduct(card(name), src(source))).toHaveProperty('skipped')
    expect(
      toProduct(card('PLANHYVLAD LIST MOELVEN FURU 27X27X3300MM', '139,00 kr'), src('planhyvlat')),
    ).toHaveProperty('skipped')
  })
})

describe('parseCategoryPage', () => {
  it('reads product cards and pagination', () => {
    const html = `
      <a class="card" href="https://www.bauhaus.se/regel-vida-45x95x3000mm" data-product-link data-id="1337521"
         data-name="REGEL VIDA 45X95X3000MM" data-price="92.25">
        <span data-price-amount="30.75" data-price-type="finalPrice" class="price-wrapper">30,75&nbsp;kr/M</span>
      </a>
      <a href="https://www.bauhaus.se/bygg/tra/lakt?p=2">2</a><a href="https://www.bauhaus.se/bygg/tra/lakt?p=3">3</a>`
    const { cards, pages } = parseCategoryPage(html, '/bygg/tra/lakt')
    expect(pages).toBe(3)
    expect(cards).toEqual([
      {
        sku: '1337521',
        name: 'REGEL VIDA 45X95X3000MM',
        url: 'https://www.bauhaus.se/regel-vida-45x95x3000mm',
        price: 92.25,
        displayPrice: '30,75 kr/M',
      },
    ])
  })
})
