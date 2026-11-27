import { useMemo } from 'react'
import { Ic, L } from './Icons'
import { cutList, purchasePlan, totalCost } from '../lib/cutlist'
import { formatKr } from '../lib/format'
import { screwJoints, screwTotals } from '../lib/screws'
import { Fold } from './Fold'
import { activePrices, useStore } from '../lib/store'
import { NumberField } from './NumberField'
import { PurchaseList } from './PlanView'
import { ScrewList } from './ScrewList'
import { BuyChecks, CheckButton, useChecks } from './Checks'
import { CATEGORY_NAMES } from '../lib/catalog'
import { countDone, isLocked, pieceKeys } from '../lib/progress'

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
        <PurchaseList plan={plan} />
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
 * Verkstad → Kapa (owner 2026-11-26): the pieces to saw as a checklist, one
 * line per piece. Checking one off locks the model (progress.ts).
 */
export function CutPanel({ onPrint }: { onPrint: () => void }) {
  const { rows } = usePlan()
  const checks = useStore((s) => s.project.checks)
  const { done, toggle } = useChecks('cut')
  const locked = isLocked({ checks })
  const askUnlock = () => useStore.setState({ lockPrompt: {} })
  if (rows.length === 0) return <p className="hint">Lägg till delar så räknas såglistan ut här.</p>
  const keys = rows.flatMap(pieceKeys)
  const pieces = keys.length
  const cut = countDone(checks, 'cut', keys)
  return (
    <div className="lists">
      <div className="list-summary">
        <strong>{cut ? `${cut} av ${pieces} kapade` : `${pieces} bitar att kapa`}</strong>
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
        <p className="hint small">Bocka av varje bit när den är kapad. Då låses modellen, så att listan inte ändras under tiden.</p>
      )}
      <ul className="cut-checklist">
        {rows.map((r) =>
          pieceKeys(r).map((key, i) => {
            const isDone = done(key)
            const size = r.width === undefined ? `${r.length} mm` : `${r.length} × ${r.width} mm`
            return (
              <li key={key} className={isDone ? 'done' : ''}>
                <CheckButton done={isDone} label={`${isDone ? 'Kapad' : 'Bocka av'}: ${r.profile.name} ${size}`} onToggle={() => toggle(key)} />
                <span className="cut-main">
                  <strong className="cut-size">{size}</strong>
                  <span className="muted small">
                    {r.profile.name} · {r.profile.kind === 'sheet' ? 'Skiva' : CATEGORY_NAMES[r.profile.category]}
                    {r.names[i] ? ` · ${r.names[i]}` : ''}
                  </span>
                  {r.notes.map((n, j) => (
                    <span key={j} className="cut-note small">
                      ✂ {n}
                    </span>
                  ))}
                </span>
                <span className="muted small cut-n">
                  {i + 1}/{r.count}
                </span>
              </li>
            )
          }),
        )}
      </ul>
    </div>
  )
}
