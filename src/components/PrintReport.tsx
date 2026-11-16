import { CutTable, PurchaseList } from './PlanView'
import { usePlan } from './CutList'
import { useStore } from '../lib/store'

/** Hidden on screen; this is what gets printed / saved as PDF. */
export function PrintReport({ snapshot }: { snapshot: string | null }) {
  const name = useStore((s) => s.project.name)
  const kerf = useStore((s) => s.settings.kerf)
  const { rows, plan, usesExamples } = usePlan()
  const date = new Date().toLocaleDateString('sv-SE')

  return (
    <div className="print-report">
      <header>
        <h1>{name}</h1>
        <span>
          Snickerei · {date}
        </span>
      </header>
      {snapshot && <img className="snapshot" src={snapshot} alt="3D-vy av projektet" />}
      <h2>Såglista</h2>
      {rows.length ? <CutTable rows={rows} /> : <p>Inga delar.</p>}
      <h2>Inköpslista</h2>
      <p className="small">Beräknad med {kerf} mm snittbredd.</p>
      <PurchaseList plan={plan} expanded />
      {usesExamples && <p className="warn">Vissa priser är exempelpriser — inte riktiga butikspriser.</p>}
    </div>
  )
}
