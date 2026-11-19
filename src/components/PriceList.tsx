import { useMemo, useState } from 'react'
import { CATEGORY_NAMES, EXAMPLE_PRICES, PROFILES, SHEET_CATEGORIES, shortName } from '../lib/catalog'
import { ageInDays, formatAge, formatDate, formatKr, STALE_DAYS } from '../lib/format'
import { supplierEntries } from '../lib/prices'
import { useStore } from '../lib/store'
import type { PriceEntry, Profile, ProfileCategory } from '../lib/types'
import { NumberField } from './NumberField'

/** Cheapest supplier price, as kr/lm for boards or kr/sheet for sheets. */
function cheapest(prof: Profile, entries: PriceEntry[]): { value: number; sizes: number } | null {
  const own = entries.filter((e) => e.profileId === prof.id && e.length !== undefined)
  if (!own.length) return null
  const per = own.map((e) => (prof.kind === 'sheet' ? e.price : (e.price / e.length!) * 1000))
  return { value: Math.min(...per), sizes: new Set(own.map((e) => `${e.length}x${e.width ?? ''}`)).size }
}

export function PriceList() {
  const ownPrices = useStore((s) => s.ownPrices)
  const setOwnPrice = useStore((s) => s.setOwnPrice)
  const useExamplePrices = useStore((s) => s.useExamplePrices)
  const setUseExamplePrices = useStore((s) => s.setUseExamplePrices)
  const files = useStore((s) => s.supplierFiles)
  const disabled = useStore((s) => s.disabledSuppliers)
  const setSupplierEnabled = useStore((s) => s.setSupplierEnabled)
  const supplierPrices = useMemo(() => files.map((f) => ({ file: f, entries: supplierEntries(f) })), [files])

  return (
    <div className="lists">
      <p className="hint">
        Ordning: ditt eget pris → butikspriser (billigast vinner) → exempelpris. Virke i kr per löpmeter, skivor i kr
        per skiva.
      </p>
      {supplierPrices.map(({ file }) => (
        <label key={file.supplier} className="check">
          <input
            type="checkbox"
            checked={!disabled.includes(file.supplier)}
            onChange={(e) => setSupplierEnabled(file.supplier, e.target.checked)}
          />
          <span>
            Använd priser från {file.supplier}
            <span className={`small age ${ageInDays(file.fetchedAt) > STALE_DAYS ? 'stale' : 'muted'}`}>
              Webbpriser hämtade {formatDate(file.fetchedAt)} ({formatAge(file.fetchedAt)}) · uppdateras varje måndag
            </span>
          </span>
        </label>
      ))}
      {files.length === 0 && (
        <p className="hint">
          Butikspriser hämtas inte just nu. Skriv in dina egna priser nedan (kr per löpmeter eller per skiva), eller
          använd exempelpriserna för en ungefärlig kostnad.
        </p>
      )}
      {files.length > 0 && <SourceNote />}
      <label className="check">
        <input type="checkbox" checked={useExamplePrices} onChange={(e) => setUseExamplePrices(e.target.checked)} />
        Använd exempelpriser där riktiga priser saknas
      </label>

      {(Object.keys(CATEGORY_NAMES) as ProfileCategory[]).map((cat) => {
        const sheet = SHEET_CATEGORIES.includes(cat)
        return (
          <section key={cat}>
            <h3>{CATEGORY_NAMES[cat]}</h3>
            {sheet && <SheetSizes category={cat} />}
            <table className="price-table">
              <thead>
                <tr>
                  <th>Dim.</th>
                  {supplierPrices.map(({ file }) => (
                    <th key={file.supplier} className="num">
                      {file.supplier}
                    </th>
                  ))}
                  <th className="num">Exempel</th>
                  <th className="num">Eget {sheet ? 'kr/skiva' : 'kr/lm'}</th>
                </tr>
              </thead>
              <tbody>
                {PROFILES.filter((p) => p.category === cat).map((p) => {
                  const own = ownPrices.find((e) => e.profileId === p.id)
                  const ex = EXAMPLE_PRICES.find((e) => e.profileId === p.id)
                  return (
                    <tr key={p.id}>
                      <td>{shortName(p)}</td>
                      {supplierPrices.map(({ file, entries }) => {
                        const c = cheapest(p, entries)
                        return (
                          <td key={file.supplier} className="num">
                            {c ? (
                              <>
                                {c.sizes > 1 && <span className="muted small">fr. </span>}
                                {sheet ? formatKr(c.value) : c.value.toFixed(2)}
                              </>
                            ) : (
                              <span className="muted">–</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="num muted">{ex ? (sheet ? ex.price.toFixed(0) : ex.price.toFixed(2)) : '–'}</td>
                      <td className="num">
                        <PriceInput value={own?.price} onCommit={(v) => setOwnPrice(p.id, v)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}

/** Where shop prices come from, and that we're not affiliated. */
export function SourceNote() {
  return (
    <p className="hint small source-note">
      Butikspriserna hämtas automatiskt från butikernas webbplatser en gång i veckan och kan skilja sig från priset i
      butik. Snickerei är ett fritt hobbyprojekt utan koppling till butikerna. Varje pris länkar till produktsidan.
    </p>
  )
}

function PriceInput({ value, onCommit }: { value?: number; onCommit: (v: number | null) => void }) {
  if (value === undefined) {
    return (
      <input
        className="price-input"
        inputMode="decimal"
        placeholder="–"
        aria-label="Eget pris"
        onBlur={(e) => {
          const v = Number(e.target.value.replace(',', '.'))
          if (e.target.value && Number.isFinite(v) && v > 0) onCommit(v)
          e.target.value = ''
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    )
  }
  return (
    <span className="price-own">
      <NumberField value={value} min={0} onCommit={(v) => onCommit(v === 0 ? null : v)} />
      <button className="link" title="Ta bort eget pris" onClick={() => onCommit(null)}>
        ×
      </button>
    </span>
  )
}

/**
 * The sheet sizes the shop sells for one material, used for the shopping list
 * and the cutting diagrams. Starts with the standard sizes; your own list
 * replaces them until you reset it.
 */
function SheetSizes({ category }: { category: ProfileCategory }) {
  const own = useStore((s) => s.ownSheetSizes[category])
  const setSizes = useStore((s) => s.setOwnSheetSizes)
  const defaults = PROFILES.find((p) => p.category === category)?.stockSheets ?? []
  const sizes = own ?? defaults
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const num = (t: string) => Number(t.replace(',', '.'))
  const add = () => {
    const a = num(length)
    const b = num(width)
    if (!(a > 0 && b > 0)) return
    const size: [number, number] = [Math.max(a, b), Math.min(a, b)]
    if (!sizes.some(([l, w]) => l === size[0] && w === size[1])) setSizes(category, [...sizes, size])
    setLength('')
    setWidth('')
  }
  return (
    <div className="sheet-sizes">
      <div className="sheet-sizes-head">
        <span className="small">
          <strong>Skivstorlekar</strong> {own ? '(dina)' : '(standard — ändra efter din butik)'}
        </span>
        {own && (
          <button className="link" onClick={() => setSizes(category, null)}>
            Återställ
          </button>
        )}
      </div>
      <div className="sheet-size-chips">
        {sizes.map(([l, w]) => (
          <span key={`${l}x${w}`} className="sheet-size">
            {l} × {w}
            {sizes.length > 1 && (
              <button
                className="link"
                aria-label={`Ta bort ${l} × ${w}`}
                onClick={() => setSizes(category, sizes.filter(([a, b]) => a !== l || b !== w))}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      <form
        className="sheet-size-add"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input inputMode="numeric" placeholder="Längd" aria-label="Längd (mm)" value={length} onChange={(e) => setLength(e.target.value)} />
        <span>×</span>
        <input inputMode="numeric" placeholder="Bredd" aria-label="Bredd (mm)" value={width} onChange={(e) => setWidth(e.target.value)} />
        <span className="muted small">mm</span>
        <button type="submit">Lägg till</button>
      </form>
    </div>
  )
}
