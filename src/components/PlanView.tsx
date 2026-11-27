import { CATEGORY_NAMES } from '../lib/catalog'
import type { CutRow, PlanItem, PlanRow } from '../lib/cutlist'
import { priceDates, totalCost } from '../lib/cutlist'
import { ageInDays, formatAge, formatDate, formatKr, formatM, STALE_DAYS } from '../lib/format'
import { BoardBar, SheetDiagram } from './Diagrams'
import { BuyItem, BuyScope } from './Checks'

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
          <tr key={`${r.profile.id}-${r.length}-${r.width}-${r.notes.join()}`} title={r.names.join(', ')}>
            <td>
              {r.profile.name}
              <div className="muted small">
                {r.profile.kind === 'sheet' ? 'Skiva' : CATEGORY_NAMES[r.profile.category]}
              </div>
              {r.notes.map((n, i) => (
                <div key={i} className="cut-note small">
                  ✂ {n}
                </div>
              ))}
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
        <BuyScope key={r.profile.id} value={r.profile.id}>
        <div className="plan">
          <div className="plan-head">
            <strong>
              {r.profile.name}{' '}
              {r.profile.kind === 'board' && <span className="muted small">{CATEGORY_NAMES[r.profile.category]}</span>}
            </strong>
            <span>{r.cost === null ? 'Pris saknas' : formatKr(r.cost)}</span>
          </div>
          {r.kind === 'board' ? <BoardPlanBody r={r} expanded={expanded} /> : <SheetPlanBody r={r} expanded={expanded} />}
        </div>
        </BuyScope>
      ))}
      <div className="total">
        <span>Totalt</span>
        <strong>{total === null ? 'Pris saknas för vissa material' : formatKr(total)}</strong>
      </div>
      <PriceAge plan={plan} />
    </>
  )
}

/** When the shop prices in this plan were collected; flagged when old. */
export function PriceAge({ plan }: { plan: PlanRow[] }) {
  return (
    <>
      {priceDates(plan).map(({ supplier, fetchedAt }) => {
        const stale = ageInDays(fetchedAt) > STALE_DAYS
        return (
          <p key={supplier} className={stale ? 'warn' : 'price-age'}>
            Webbpriser från {supplier} hämtade {formatDate(fetchedAt)} ({formatAge(fetchedAt)}).
            {stale ? ' Priserna kan ha ändrats — kontrollera i butiken.' : ' Priset i butik kan skilja sig.'} Snickerei
            har ingen koppling till {supplier}.
          </p>
        )
      })}
    </>
  )
}

/** Shopping list lines: what to buy, price each, and a link to the product. */
function ItemList({ items, label }: { items: PlanItem[]; label: (i: PlanItem) => string }) {
  return (
    <ul className="items">
      {items.map((i) => (
        <li key={`${i.length}x${i.width}`}>
          <BuyItem id={`${i.length}x${i.width}`} label={label(i)}>
            <span>{label(i)}</span>
          </BuyItem>
          {i.offer && (
            <span className="muted small">
              {formatKr(i.offer.price)}/st ·{' '}
              {i.offer.url ? (
                <a href={i.offer.url} target="_blank" rel="noreferrer" title={i.offer.name}>
                  {i.offer.supplier} ↗
                </a>
              ) : (
                i.offer.supplier
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
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
      <ItemList items={r.items} label={(i) => `${i.count} st × ${formatM(i.length)}`} />
      <Diagram expanded={expanded} summary={`Kapschema · spill ${formatM(waste)}`}>
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
          {formatM(r.longestStock)}): {r.tooLong.join(', ')} mm
        </p>
      )}
    </>
  )
}

function SheetPlanBody({ r, expanded }: { r: Extract<PlanRow, { kind: 'sheet' }>; expanded: boolean }) {
  const usage = r.sheets.length ? r.sheets.reduce((s, x) => s + x.usage, 0) / r.sheets.length : 0
  return (
    <>
      <ItemList
        items={r.items}
        label={(i) => `${i.count} skiv${i.count === 1 ? 'a' : 'or'} ${i.length} × ${i.width} mm`}
      />
      <Diagram
        expanded={expanded}
        summary={`Skärschema · utnyttjande ${Math.round(usage * 100)} %`}
      >
        <div className="sheets">
          {r.sheets.map((s, i) => (
            <SheetDiagram key={i} sheet={s} />
          ))}
        </div>
        {r.sheets.some((s) => s.pieces.some((p) => p.grainLocked)) && (
          <p className="hint small">Randade delar har låst fiberriktning, längs skivans långsida.</p>
        )}
      </Diagram>
      {r.tooLarge.length > 0 && (
        <p className="warn">
          {r.tooLarge.length} del(ar) är större än skivan ({r.sheetSize.join(' × ')} mm):{' '}
          {r.tooLarge.map((p) => p.join(' × ')).join(', ')} mm
        </p>
      )}
    </>
  )
}
