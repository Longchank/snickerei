import { useMemo } from 'react'
import { Ic, L } from './Icons'
import { cutList, cutSchedule, purchasePlan, totalCost, type CutPiece } from '../lib/cutlist'
import { formatKr } from '../lib/format'
import { screwJoints, screwTotals } from '../lib/screws'
import { Fold } from './Fold'
import { activePrices, useStore } from '../lib/store'
import { NumberField } from './NumberField'
import { PurchaseList } from './PlanView'
import { ScrewList } from './ScrewList'
import { BuyChecks, CheckButton, useChecks } from './Checks'
import { CATEGORY_NAMES } from '../lib/catalog'
import { countDone, isLocked } from '../lib/progress'
import { BoardBar, SheetDiagram } from './Diagrams'
import { zoomToParts } from './Viewport'
import { formatM } from '../lib/format'

export function usePlan() {
  const parts = useStore((s) => s.project.parts)
  const kerf = useStore((s) => s.settings.kerf)
  const ownPrices = useStore((s) => s.ownPrices)
  const useExamplePrices = useStore((s) => s.useExamplePrices)
  const supplierFiles = useStore((s) => s.supplierFiles)
  const disabledSuppliers = useStore((s) => s.disabledSuppliers)
  const ownSheetSizes = useStore((s) => s.ownSheetSizes)
  const ownStockLengths = useStore((s) => s.ownStockLengths)
  const rows = useMemo(() => cutList(parts), [parts])
  const plan = useMemo(
    () =>
      purchasePlan(parts, activePrices({ ownPrices, useExamplePrices, supplierFiles, disabledSuppliers }), kerf, {
        sheets: ownSheetSizes,
        lengths: ownStockLengths,
      }),
    [parts, ownPrices, useExamplePrices, supplierFiles, disabledSuppliers, kerf, ownSheetSizes, ownStockLengths],
  )
  // Only warn about example prices when one is actually used
  const usesExamples = plan.some((r) => r.items.some((i) => i.offer?.supplier === 'Exempel'))
  return { rows, plan, usesExamples }
}

/** Handla → Inköp: what to buy (boards and sheets, screws), with the total */
export function ShopList({ onPrint }: { onPrint: () => void }) {
  const { rows, plan, usesExamples } = usePlan()
  const kerf = useStore((s) => s.settings.kerf)
  const setSettings = useStore((s) => s.setSettings)
  const parts = useStore((s) => s.project.parts)
  const counts = useStore((s) => s.project.screwEdits)
  const screwCount = useMemo(() => screwTotals(screwJoints(parts, counts)).reduce((n, t) => n + t.toBuy, 0), [parts, counts])

  if (rows.length === 0) return <p className="hint">Lägg till delar så räknas inköpslistan ut här.</p>
  const total = totalCost(plan)
  const stock = plan.reduce((n, r) => n + r.items.reduce((m, i) => m + i.count, 0), 0)

  return (
    <BuyChecks>
    <div className="lists">
      <div className="list-summary">
        <strong>{total !== null ? `≈ ${formatKr(total)}` : `${stock} st att köpa`}</strong>
        {usesExamples && <span className="warn-chip" title="Vissa priser är exempelpriser — inte riktiga butikspriser">exempelpris</span>}
        <button onClick={onPrint} title="Skriv ut eller spara som PDF">
          <Ic i={L.print} /> PDF
        </button>
      </div>
      <Fold id="list-buy" title="Inköpslista" status={`${stock} st${total !== null ? ` · ${formatKr(total)}` : ''}`} defaultOpen>
        <PurchaseList plan={plan} schema={false} />
        <label className="field inline compact-field">
          <span>Sågblad</span>
          <NumberField value={kerf} min={0} suffix="mm" onCommit={(v) => setSettings({ kerf: v })} />
        </label>
      </Fold>
      <Fold id="list-screws" title="Skruv" status={screwCount ? `${screwCount} st` : '–'}>
        <ScrewList buyOnly />
      </Fold>
      <p className="hint small">Bocka av det du har köpt — bockarna sparas i projektet.</p>
    </div>
    </BuyChecks>
  )
}

/**
 * Verkstad → Kapa (owner 2026-11-26/27): the cutting schedule — each stock
 * board or sheet with its diagram and the pieces to saw from it, one check
 * per piece. A checked piece shows in the diagram and, in 3D, its part turns
 * green. Checking one off locks the model (progress.ts).
 */
export function CutPanel({ onPrint }: { onPrint: () => void }) {
  const { plan } = usePlan()
  const parts = useStore((s) => s.project.parts)
  const checks = useStore((s) => s.project.checks)
  const { done, toggle } = useChecks('cut')
  const schedule = useMemo(() => cutSchedule(parts, plan), [parts, plan])
  const locked = isLocked({ checks })
  const askUnlock = () => useStore.setState({ lockPrompt: {} })
  const all = schedule.flatMap((sec) => [...sec.stocks.flatMap((st) => st.pieces), ...sec.oversize])
  if (all.length === 0) return <p className="hint">Lägg till delar så räknas kapschemat ut här.</p>
  const keys = all.map((p) => p.key)
  const cut = countDone(checks, 'cut', keys)

  const pieceRow = (p: CutPiece) => {
    const isDone = done(p.key)
    const size = p.width === undefined ? `${p.length} mm` : `${p.length} × ${p.width} mm`
    return (
      <li key={p.key} className={isDone ? 'done' : ''}>
        <CheckButton done={isDone} label={`${isDone ? 'Kapad' : 'Bocka av'}: ${p.name || size}`} onToggle={() => toggle(p.key)} />
        <button className="cut-main" onClick={() => p.partIds.length && zoomToParts(p.partIds)} title="Visa delen i 3D">
          <strong className="cut-size">{size}</strong>
          {p.name && <span className="muted small">{p.name}</span>}
          {p.notes.map((n, j) => (
            <span key={j} className="cut-note small">
              ✂ {n}
            </span>
          ))}
        </button>
      </li>
    )
  }

  return (
    <div className="lists">
      <div className="list-summary">
        <strong>{cut ? `${cut} av ${keys.length} kapade` : `${keys.length} bitar att kapa`}</strong>
        <button onClick={onPrint} title="Skriv ut eller spara som PDF">
          <Ic i={L.print} /> PDF
        </button>
      </div>
      {locked ? (
        <div className="lock-note">
          <Ic i={L.lock} />
          <span>Modellen är låst medan du kapar.</span>
          <button onClick={askUnlock}>Lås upp</button>
        </div>
      ) : (
        <p className="hint small">Bocka av varje bit när den är kapad – den blir grön i 3D. Då låses modellen, så att listan inte ändras under tiden.</p>
      )}
      {schedule.map((sec) => (
        <section key={sec.profile.id} className="cut-section">
          <h4>
            {sec.profile.name}{' '}
            <span className="muted small">{sec.profile.kind === 'sheet' ? 'Skiva' : CATEGORY_NAMES[sec.profile.category]}</span>
          </h4>
          {sec.stocks.map((st, n) => {
            const flags = st.pieces.map((p) => done(p.key))
            const left = flags.filter((f) => !f).length
            const title = st.board
              ? `Bräda ${n + 1} av ${sec.stocks.length} · ${formatM(st.board.length)}`
              : `Skiva ${n + 1} av ${sec.stocks.length} · ${st.sheet!.length} × ${st.sheet!.width}`
            return (
              <div key={n} className={`cut-stock ${left === 0 ? 'done' : ''}`}>
                <div className="cut-stock-head">
                  <strong>{title}</strong>
                  <span className="muted small">{left === 0 ? '✓ klar' : `${flags.length - left}/${flags.length}`}</span>
                </div>
                {st.board ? <BoardBar board={st.board} done={flags} /> : <SheetDiagram sheet={st.sheet!} done={flags} />}
                <ul className="cut-checklist">{st.pieces.map(pieceRow)}</ul>
              </div>
            )
          })}
          {sec.oversize.length > 0 && (
            <div className="cut-stock">
              <p className="warn small">Ryms inte i butikens längder eller skivor – skarva eller köp större:</p>
              <ul className="cut-checklist">{sec.oversize.map(pieceRow)}</ul>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
