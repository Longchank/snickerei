import { useSelectedParts, useStore } from '../lib/store'
import { SpaceInfo } from './MeasurePanel'

/** Free space around the selection and furniture guideline values (riktvärden). */
export function Analysis() {
  const selected = useSelectedParts()
  const setMeasureMode = useStore((s) => s.setMeasureMode)
  return (
    <div className="inspector analysis">
      <h2>Analys</h2>
      {selected.length ? (
        <SpaceInfo parts={selected} />
      ) : (
        <p className="hint">
          Markera en del eller en grupp för att se det fria utrymmet runt den och riktvärden — t.ex. om en bordsskiva
          sitter på en bra höjd.
        </p>
      )}
      <button className="analysis-measure" onClick={() => setMeasureMode(true)}>
        📏 Mät mellan ytor
      </button>
    </div>
  )
}
