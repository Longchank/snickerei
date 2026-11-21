import { useEffect, useMemo, useRef } from 'react'
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
  const { plan } = usePlan()
  return useMemo(() => {
    if (!parts.length) return []
    return runChecks(parts, analyse(parts, purpose), screwJoints(parts), plan)
  }, [parts, purpose, plan])
}

/**
 * The checklist in Inköp. Each item can be shown in 3D (its parts selected)
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
  useEffect(() => {
    if (focus) refs.current.get(focus.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
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
        <span className="small">Krockar, hållfasthet, skruv och inköp. Tryck på ett ! i 3D för att hoppa hit.</span>
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
              <span className="check-mark" aria-label={i.severity === 'bad' ? 'Måste åtgärdas' : 'Bör kollas'}>
                !
              </span>
              <div className="check-body">
                <strong>{i.title}</strong>
                <span className="small">{i.detail}</span>
                <div className="check-actions">
                  {i.partIds.length > 0 && (
                    <button
                      onClick={() => {
                        select(i.partIds)
                        // One window at a time: close the list so the parts are in view
                        requestPanel(false)
                      }}
                    >
                      ◎ Visa i 3D
                    </button>
                  )}
                  {i.fix !== 'inkop' && (
                    <button
                      className="fix-in"
                      style={{ background: fix.color, borderColor: fix.color }}
                      onClick={() => {
                        setMode(i.fix)
                        if (i.partIds.length) select(i.fix === 'detaljer' ? i.partIds.slice(0, 1) : i.partIds)
                      }}
                    >
                      Fixa i {fix.n} {fix.label} →
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="hint small">Hållfasthet och skruv är uppskattningar efter tumregler — se dem som en checklista, inte en garanti.</p>
    </div>
  )
}
