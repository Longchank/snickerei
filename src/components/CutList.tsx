import { useMemo } from 'react'
import { CATEGORY_NAMES } from '../lib/catalog'
import { cutList, purchasePlan } from '../lib/cutlist'
import { formatKr, formatM } from '../lib/format'
import { activePrices, useStore } from '../lib/store'
import { NumberField } from './NumberField'

export function CutList() {
  const parts = useStore((s) => s.project.parts)
  const kerf = useStore((s) => s.settings.kerf)
  const setSettings = useStore((s) => s.setSettings)
  const ownPrices = useStore((s) => s.ownPrices)
  const useExamplePrices = useStore((s) => s.useExamplePrices)

  const rows = useMemo(() => cutList(parts), [parts])
  const plan = useMemo(
    () => purchasePlan(parts, activePrices({ ownPrices, useExamplePrices }), kerf),
    [parts, ownPrices, useExamplePrices, kerf],
  )
  const total = plan.every((r) => r.cost !== null) ? plan.reduce((s, r) => s + (r.cost ?? 0), 0) : null

  if (parts.length === 0) return <p className="hint">Lägg till delar så räknas såglistan ut här.</p>

  return (
    <div className="lists">
      <h3>Såglista</h3>
      <table>
        <thead>
          <tr>
            <th>Dimension</th>
            <th className="num">Längd</th>
            <th className="num">Antal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.profile.id}-${r.length}`} title={r.names.join(', ')}>
              <td>
                {r.profile.name}
                <div className="muted small">{CATEGORY_NAMES[r.profile.category]}</div>
              </td>
              <td className="num">{r.length} mm</td>
              <td className="num">{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Inköpslista</h3>
      <label className="field inline">
        <span>Sågklinga (snittbredd)</span>
        <NumberField value={kerf} min={0} suffix="mm" onCommit={(v) => setSettings({ kerf: v })} />
      </label>
      {plan.map((r) => {
        const counts = new Map<number, number>()
        r.boards.forEach((b) => counts.set(b.length, (counts.get(b.length) ?? 0) + 1))
        const waste = r.boards.reduce((s, b) => s + b.waste, 0)
        return (
          <div key={r.profile.id} className="plan">
            <div className="plan-head">
              <strong>
                {r.profile.name} <span className="muted small">{CATEGORY_NAMES[r.profile.category]}</span>
              </strong>
              <span>{r.cost === null ? 'Pris saknas' : formatKr(r.cost)}</span>
            </div>
            <ul>
              {[...counts.entries()]
                .sort(([a], [b]) => b - a)
                .map(([len, n]) => (
                  <li key={len}>
                    {n} st × {formatM(len)}
                  </li>
                ))}
            </ul>
            <details>
              <summary className="muted small">
                Kapschema · spill {formatM(waste)}
                {r.supplier && ` · pris: ${r.supplier}`}
              </summary>
              <ol className="boards">
                {r.boards.map((b, i) => (
                  <li key={i}>
                    <div className="board-bar">
                      {b.cuts.map((c, j) => (
                        <span key={j} style={{ flexGrow: c }} title={`${c} mm`}>
                          {c}
                        </span>
                      ))}
                      <span className="waste" style={{ flexGrow: b.waste }} title={`Spill ${b.waste} mm`} />
                    </div>
                    <span className="muted small">{formatM(b.length)}</span>
                  </li>
                ))}
              </ol>
            </details>
            {r.tooLong.length > 0 && (
              <p className="warn">
                {r.tooLong.length} del(ar) är längre än längsta saluförda längd ({formatM(Math.max(...r.profile.stockLengths))}):{' '}
                {r.tooLong.join(', ')} mm
              </p>
            )}
          </div>
        )
      })}
      <div className="total">
        <span>Totalt</span>
        <strong>{total === null ? 'Pris saknas för vissa dimensioner' : formatKr(total)}</strong>
      </div>
      {useExamplePrices && <p className="warn">Exempelpriser används — inte riktiga butikspriser.</p>}
    </div>
  )
}
