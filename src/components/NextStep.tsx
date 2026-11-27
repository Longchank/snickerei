import { useState } from 'react'
import { Ic, L } from './Icons'
import { useStepWarnings } from './Checklist'
import { zoomToParts } from './Viewport'
import { PHASES, phaseInfo } from '../lib/phases'
import { useStore } from '../lib/store'

/**
 * The foot of each step's panel (owner 2026-11-26): what's left to fix in
 * this step ("⚠ 2 att rätta här" folds out the list, each with "Visa i 3D"
 * when there are parts to point at) and "Fortsätt till …" the next step.
 * Steps stay views, not gates: it shows the way without forcing it.
 */
export function NextStep({ onShow }: { onShow: () => void }) {
  const mode = useStore((s) => s.settings.mode)
  const setMode = useStore((s) => s.setMode)
  const select = useStore((s) => s.select)
  const hasParts = useStore((s) => s.project.parts.length > 0)
  const warnings = useStepWarnings()[mode]
  const [open, setOpen] = useState(false)
  const index = PHASES.findIndex((p) => p.id === mode)
  const next = PHASES[index + 1]
  if (!hasParts || (!next && !warnings.length)) return null
  const bad = warnings.some((i) => i.severity === 'bad')

  return (
    <div className="next-step">
      {open && warnings.length > 0 && (
        <ul className="next-list">
          {warnings.map((i) => (
            <li key={i.id} className={i.severity}>
              <span>
                <strong>{i.title}</strong>
                <span className="muted small">{i.detail}</span>
              </span>
              {i.partIds.length > 0 && (
                <button
                  className="icon"
                  aria-label={`Visa i 3D: ${i.title}`}
                  title="Visa i 3D"
                  onClick={() => {
                    select(i.partIds)
                    zoomToParts(i.partIds)
                    onShow()
                  }}
                >
                  <Ic i={L.showIn3d} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="next-row">
        {warnings.length > 0 ? (
          <button className={`next-warn ${bad ? 'bad' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
            <Ic i={L.warning} /> {warnings.length} att rätta här
          </button>
        ) : (
          <span className="next-ok muted small">
            <Ic i={L.ok} /> Inget att rätta här
          </span>
        )}
        {next && (
          <button
            className="next-go"
            style={{ background: phaseInfo(next.id).color, borderColor: phaseInfo(next.id).color }}
            onClick={() => setMode(next.id)}
          >
            Fortsätt till {next.label} <Ic i={L.next} />
          </button>
        )}
      </div>
    </div>
  )
}
