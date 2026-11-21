import { useMemo } from 'react'
import { cutList, purchasePlan, totalCost } from '../lib/cutlist'
import { formatKr } from '../lib/format'
import { screwJoints, screwTotals } from '../lib/screws'
import { Fold } from './Fold'
import { activePrices, useStore } from '../lib/store'
import { NumberField } from './NumberField'
import { CutTable, PurchaseList } from './PlanView'
import { ScrewList } from './ScrewList'

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

export function CutList({ onPrint }: { onPrint: () => void }) {
  const { rows, plan, usesExamples } = usePlan()
  const kerf = useStore((s) => s.settings.kerf)
  const setSettings = useStore((s) => s.setSettings)
  const parts = useStore((s) => s.project.parts)
  const screwCount = useMemo(() => screwTotals(screwJoints(parts)).reduce((n, t) => n + t.toBuy, 0), [parts])

  if (rows.length === 0) return <p className="hint">Lägg till delar så räknas såglistan ut här.</p>
  const total = totalCost(plan)
  const pieces = rows.reduce((n, r) => n + r.count, 0)
  const stock = plan.reduce((n, r) => n + r.items.reduce((m, i) => m + i.count, 0), 0)

  return (
    <div className="lists">
      <div className="list-summary">
        <strong>{total !== null ? `≈ ${formatKr(total)}` : `${stock} st att köpa`}</strong>
        {usesExamples && <span className="warn-chip" title="Vissa priser är exempelpriser — inte riktiga butikspriser">exempelpris</span>}
        <button onClick={onPrint} title="Skriv ut eller spara som PDF">
          🖨 PDF
        </button>
      </div>
      <Fold id="list-buy" title="Inköpslista" status={`${stock} st${total !== null ? ` · ${formatKr(total)}` : ''}`} defaultOpen>
        <PurchaseList plan={plan} />
        <label className="field inline compact-field">
          <span>Sågblad</span>
          <NumberField value={kerf} min={0} suffix="mm" onCommit={(v) => setSettings({ kerf: v })} />
        </label>
      </Fold>
      <Fold id="list-cut" title="Såglista" status={`${pieces} bitar`}>
        <CutTable rows={rows} />
      </Fold>
      <Fold id="list-screws" title="Skruv" status={screwCount ? `${screwCount} st` : '–'}>
        <ScrewList buyOnly />
      </Fold>
    </div>
  )
}
