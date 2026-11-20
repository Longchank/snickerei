import { useMemo } from 'react'
import { screwJoints, screwName, screwTotals } from '../lib/screws'
import { useStore } from '../lib/store'

const mm = (v: number) => String(v).replace('.', ',')

/**
 * Suggested screws: totals to buy (with pilot bits), then joint by joint.
 * Rules of thumb, shown as suggestions.
 */
export function ScrewList({ print = false }: { print?: boolean }) {
  const parts = useStore((s) => s.project.parts)
  const joints = useMemo(() => screwJoints(parts), [parts])
  const totals = useMemo(() => screwTotals(joints), [joints])
  if (!joints.length) return <p className="hint small">Inga delar ligger an mot varandra än — då behövs inga skruvar.</p>
  return (
    <div className="screw-list">
      <table className="screw-table">
        <thead>
          <tr>
            <th>Skruv</th>
            <th className="num">Behövs</th>
            <th className="num">Köp</th>
            <th>Förborra</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((t) => (
            <tr key={screwName(t.screw)}>
              <td>{screwName(t.screw)}</td>
              <td className="num">{t.count}</td>
              <td className="num">{t.toBuy}</td>
              <td>{t.bits.length ? t.bits.map((b) => `Ø ${mm(b)} mm`).join(', ') : <span className="muted">–</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint small">
        "Köp" har ca 10 % extra. Skruv säljs ofta i askar om 100–250 st. Förslag efter tumregler: skruven ska gå ca 1,5 gånger
        delens tjocklek in i delen bakom (mer i ändträ), minst 2 per fog. Förborra i den mottagande delen med borren i
        tabellen.
      </p>
      <details className="screw-joints" open={print}>
        <summary>Fog för fog ({joints.length})</summary>
        <ul>
          {joints.map((j) => (
            <li key={`${j.through.id}|${j.into.id}`}>
              <strong>
                {j.through.name} → {j.into.name}
              </strong>
              <span>
                {j.count} st {screwName(j.screw)}
                {j.endGrain ? ' · i ändträ' : ''}
              </span>
              {j.predrill && (
                <span className="predrill">
                  Förborra Ø {mm(j.predrill.bit)} mm ({j.predrill.reason})
                </span>
              )}
              {j.short && <span className="warn small">Kortare än tumregeln — delen bakom är tunn. Överväg vinkeljärn.</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
