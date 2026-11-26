import { useEffect, useMemo, useRef, useState } from 'react'
import { Ic, L } from './Icons'
import { zoomToParts } from './Viewport'
import { Info } from './Info'
import { runChecks, type Issue } from '../lib/checks'
import { phaseInfo } from '../lib/phases'
import { screwJoints } from '../lib/screws'
import { useStore } from '../lib/store'
import { analyse } from '../lib/strength'
import { usePlan } from './CutList'

/** Everything to look at before buying (step 4), worst first */
export function useChecks(): Issue[] {
  const parts = useStore((s) => s.project.parts)
  const purpose = useStore((s) => s.project.purpose ?? 'forvaring')
  const counts = useStore((s) => s.project.screwEdits)
  const { plan } = usePlan()
  return useMemo(() => {
    if (!parts.length) return []
    return runChecks(parts, analyse(parts, purpose), screwJoints(parts, counts), plan)
  }, [parts, purpose, plan, counts])
}

/**
 * The checklist in Handla. Each item can be shown in 3D (its parts selected)
 * or taken to the step where it's fixed. A tap on a "!" in 3D lands here
 * on that item.
 */
export function Checklist() {
  const issues = useChecks()
  const focus = useStore((s) => s.checkFocus)
  const select = useStore((s) => s.select)
  const setMode = useStore((s) => s.setMode)
  const requestPanel = useStore((s) => s.requestPanel)
  const parts = useStore((s) => s.project.parts)
  const refs = useRef(new Map<string, HTMLLIElement>())
  // Which item shows its explanation: the one tapped, or the "!" tapped in 3D
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    if (!focus) return
    setOpen(focus.id)
    refs.current.get(focus.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focus])
  if (!parts.length) return <p className="hint">Lägg till delar först — sedan kontrolleras bygget här innan du handlar.</p>
  const bad = issues.filter((i) => i.severity === 'bad').length
  const warn = issues.length - bad
  return (
    <div className="checklist">
      <div className={`check-summary ${bad ? 'bad' : warn ? 'warn' : 'ok'}`}>
        {issues.length === 0 ? (
          <strong>✓ Allt ser bra ut — dags att handla</strong>
        ) : (
          <strong>
            {bad ? `${bad} att åtgärda` : ''}
            {bad && warn ? ' · ' : ''}
            {warn ? `${warn} att kolla` : ''}
          </strong>
        )}
      </div>
      <ul className="check-list">
        {issues.map((i) => {
          const fix = phaseInfo(i.fix)
          return (
            <li
              key={i.id}
              ref={(el) => {
                if (el) refs.current.set(i.id, el)
                else refs.current.delete(i.id)
              }}
              className={`check-item ${i.severity}${focus?.id === i.id ? ' focused' : ''}`}
            >
              <button
                className="check-row"
                aria-expanded={open === i.id}
                onClick={() => setOpen(open === i.id ? null : i.id)}
              >
                <span className="check-mark" aria-label={i.severity === 'bad' ? 'Måste åtgärdas' : 'Bör kollas'}>
                  !
                </span>
                <strong>{i.title}</strong>
              </button>
              {i.partIds.length > 0 && (
                <button
                  className="check-act"
                  title="Visa i 3D"
                  aria-label={`Visa i 3D: ${i.title}`}
                  onClick={() => {
                    select(i.partIds)
                    // One window at a time: close the list so the parts are in view
                    requestPanel(false)
                    zoomToParts(i.partIds)
                  }}
                >
                  <Ic i={L.showIn3d} />
                </button>
              )}
              {i.fix !== 'handla' && (
                <button
                  className="check-act fix-in"
                  style={{ background: fix.color, borderColor: fix.color }}
                  title={`Fixa i ${fix.n} ${fix.label}`}
                  aria-label={`Fixa i ${fix.n} ${fix.label}: ${i.title}`}
                  onClick={() => {
                    setMode(i.fix)
                    if (i.partIds.length) {
                      select(i.fix === 'detaljer' ? i.partIds.slice(0, 1) : i.partIds)
                      zoomToParts(i.partIds)
                    }
                  }}
                >
                  <Ic i={L.next} /> {fix.n}
                </button>
              )}
              {open === i.id && <p className="check-detail small">{i.detail}</p>}
            </li>
          )
        })}
      </ul>
      <Info label="Vad kontrolleras?">
        Krockar, delar som svävar, hållfasthet, tippning, skruv man inte kommer åt, brädor och skivor som är större än butiken
        säljer, och priser. Tryck på ett ! i 3D för att hoppa till punkten här. Hållfasthet och skruv är uppskattningar efter
        tumregler — se dem som en checklista, inte en garanti.
      </Info>
    </div>
  )
}
