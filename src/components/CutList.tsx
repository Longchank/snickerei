import { useMemo } from 'react'
import { cutList, purchasePlan } from '../lib/cutlist'
import { activePrices, useStore } from '../lib/store'
import { NumberField } from './NumberField'
import { CutTable, PurchaseList } from './PlanView'

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

  if (rows.length === 0) return <p className="hint">Lägg till delar så räknas såglistan ut här.</p>

  return (
    <div className="lists">
      <div className="list-actions">
        <button onClick={onPrint}>🖨 Skriv ut / spara PDF</button>
      </div>
      <h3>Såglista</h3>
      <CutTable rows={rows} />

      <h3>Inköpslista</h3>
      <label className="field inline">
        <span>Sågklinga (snittbredd)</span>
        <NumberField value={kerf} min={0} suffix="mm" onCommit={(v) => setSettings({ kerf: v })} />
      </label>
      <PurchaseList plan={plan} />
      {usesExamples && <p className="warn">Vissa priser är exempelpriser — inte riktiga butikspriser.</p>}
    </div>
  )
}
