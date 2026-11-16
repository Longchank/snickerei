import { CATEGORY_NAMES, EXAMPLE_PRICES, PROFILES } from '../lib/catalog'
import { useStore } from '../lib/store'
import type { ProfileCategory } from '../lib/types'
import { NumberField } from './NumberField'

export function PriceList() {
  const ownPrices = useStore((s) => s.ownPrices)
  const setOwnPrice = useStore((s) => s.setOwnPrice)
  const useExamplePrices = useStore((s) => s.useExamplePrices)
  const setUseExamplePrices = useStore((s) => s.setUseExamplePrices)

  return (
    <div className="lists">
      <p className="hint">
        Priser i kr per löpmeter. Automatisk hämtning från bygghandlare kommer — tills dess kan du skriva in egna
        priser. Ett eget pris ersätter exempelpriset.
      </p>
      <label className="check">
        <input type="checkbox" checked={useExamplePrices} onChange={(e) => setUseExamplePrices(e.target.checked)} />
        Använd exempelpriser där eget pris saknas
      </label>
      {(Object.keys(CATEGORY_NAMES) as ProfileCategory[]).map((cat) => (
        <section key={cat}>
          <h3>{CATEGORY_NAMES[cat]}</h3>
          <table>
            <thead>
              <tr>
                <th>Dim.</th>
                <th className="num">Exempel</th>
                <th className="num">Eget kr/lm</th>
              </tr>
            </thead>
            <tbody>
              {PROFILES.filter((p) => p.category === cat).map((p) => {
                const own = ownPrices.find((e) => e.profileId === p.id)
                const ex = EXAMPLE_PRICES.find((e) => e.profileId === p.id)
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="num muted">{ex ? ex.price.toFixed(2) : '–'}</td>
                    <td className="num">
                      <PriceInput value={own?.price} onCommit={(v) => setOwnPrice(p.id, v)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}

function PriceInput({ value, onCommit }: { value?: number; onCommit: (v: number | null) => void }) {
  if (value === undefined) {
    return (
      <input
        className="price-input"
        inputMode="decimal"
        placeholder="–"
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
