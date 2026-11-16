import { CATEGORY_NAMES } from '../lib/catalog'
import type { CutRow, PlanRow } from '../lib/cutlist'
import { totalCost } from '../lib/cutlist'
import { formatKr, formatM } from '../lib/format'
import { BoardBar, SheetDiagram } from './Diagrams'

export function CutTable({ rows }: { rows: CutRow[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Material</th>
          <th className="num">Mått (mm)</th>
          <th className="num">Antal</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.profile.id}-${r.length}-${r.width}`} title={r.names.join(', ')}>
            <td>
              {r.profile.name}
              <div className="muted small">
                {r.profile.kind === 'sheet' ? 'Skiva' : CATEGORY_NAMES[r.profile.category]}
              </div>
            </td>
            <td className="num">{r.width === undefined ? r.length : `${r.length} × ${r.width}`}</td>
            <td className="num">{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Shopping list: stock boards/sheets to buy, with cutting diagrams. */
export function PurchaseList({ plan, expanded = false }: { plan: PlanRow[]; expanded?: boolean }) {
  const total = totalCost(plan)
  return (
    <>
      {plan.map((r) => (
        <div key={r.profile.id} className="plan">
          <div className="plan-head">
            <strong>
              {r.profile.name}{' '}
              {r.profile.kind === 'board' && <span className="muted small">{CATEGORY_NAMES[r.profile.category]}</span>}
            </strong>
            <span>{r.cost === null ? 'Pris saknas' : formatKr(r.cost)}</span>
          </div>
          {r.kind === 'board' ? <BoardPlanBody r={r} expanded={expanded} /> : <SheetPlanBody r={r} expanded={expanded} />}
        </div>
      ))}
      <div className="total">
        <span>Totalt</span>
        <strong>{total === null ? 'Pris saknas för vissa material' : formatKr(total)}</strong>
      </div>
    </>
  )
}

function countBy<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>()
  items.forEach((t) => m.set(key(t), (m.get(key(t)) ?? 0) + 1))
  return [...m.entries()]
}

function Diagram({ expanded, summary, children }: { expanded: boolean; summary: string; children: React.ReactNode }) {
  return (
    <details open={expanded || undefined}>
      <summary className="muted small">{summary}</summary>
      {children}
    </details>
  )
}

function BoardPlanBody({ r, expanded }: { r: Extract<PlanRow, { kind: 'board' }>; expanded: boolean }) {
  const waste = r.boards.reduce((s, b) => s + b.waste, 0)
  return (
    <>
      <ul>
        {countBy(r.boards, (b) => String(b.length))
          .sort(([a], [b]) => Number(b) - Number(a))
          .map(([len, n]) => (
            <li key={len}>
              {n} st × {formatM(Number(len))}
            </li>
          ))}
      </ul>
      <Diagram expanded={expanded} summary={`Kapschema · spill ${formatM(waste)}${r.supplier ? ` · pris: ${r.supplier}` : ''}`}>
        <ol className="boards">
          {r.boards.map((b, i) => (
            <li key={i}>
              <BoardBar board={b} />
              <span className="muted small">{formatM(b.length)}</span>
            </li>
          ))}
        </ol>
      </Diagram>
      {r.tooLong.length > 0 && (
        <p className="warn">
          {r.tooLong.length} del(ar) är längre än längsta saluförda längd (
          {formatM(Math.max(...r.profile.stockLengths))}): {r.tooLong.join(', ')} mm
        </p>
      )}
    </>
  )
}

function SheetPlanBody({ r, expanded }: { r: Extract<PlanRow, { kind: 'sheet' }>; expanded: boolean }) {
  const usage = r.sheets.length ? r.sheets.reduce((s, x) => s + x.usage, 0) / r.sheets.length : 0
  return (
    <>
      <ul>
        {countBy(r.sheets, (s) => `${s.length} × ${s.width}`).map(([size, n]) => (
          <li key={size}>
            {n} skiv{n === 1 ? 'a' : 'or'} {size} mm
          </li>
        ))}
      </ul>
      <Diagram
        expanded={expanded}
        summary={`Skärschema · utnyttjande ${Math.round(usage * 100)} %${r.supplier ? ` · pris: ${r.supplier}` : ''}`}
      >
        <div className="sheets">
          {r.sheets.map((s, i) => (
            <SheetDiagram key={i} sheet={s} />
          ))}
        </div>
      </Diagram>
      {r.tooLarge.length > 0 && (
        <p className="warn">
          {r.tooLarge.length} del(ar) är större än skivan ({r.profile.stockSheets[0].join(' × ')} mm):{' '}
          {r.tooLarge.map((p) => p.join(' × ')).join(', ')} mm
        </p>
      )}
    </>
  )
}
