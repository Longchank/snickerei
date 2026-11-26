import { useMemo } from 'react'
import { Ic, L } from './Icons'
import { getProfile, shortName } from '../lib/catalog'
import { ASSEMBLY, buildSteps } from '../lib/steps'
import { useStore } from '../lib/store'
import { fitView } from './Viewport'
import type { Part } from '../lib/types'
import { Info } from './Info'

/** "4 × 45×95 · 1 × 18 mm": what a step is built from */
function partSummary(parts: Part[]): string {
  const counts = new Map<string, number>()
  for (const p of parts) {
    const name = shortName(getProfile(p.profileId))
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts].map(([name, n]) => `${n} × ${name}`).join(' · ')
}

/**
 * Verkstad → Montera (owner 2026-11-22; was Montering → Steg: "only the steps needed for assembly,
 * no screw info, and the order can be changed"): each group is a step, then
 * Montering puts it all together. ↑ ↓ change the order (the groups' order,
 * so Steg för steg and the screw lists follow); tapping a step shows only
 * it in 3D.
 */
export function StepList() {
  const parts = useStore((s) => s.project.parts)
  const groups = useStore((s) => s.project.groups)
  const activeStep = useStore((s) => s.activeStep)
  const setActiveStep = useStore((s) => s.setActiveStep)
  const setGroupOrder = useStore((s) => s.setGroupOrder)
  const requestPanel = useStore((s) => s.requestPanel)
  const select = useStore((s) => s.select)
  const clearSelection = useStore((s) => s.clearSelection)
  const steps = useMemo(() => buildSteps(parts, groups), [parts, groups])

  if (!parts.length) return <p className="hint">Bygg något först — sedan visas monteringsstegen här.</p>

  const groupSteps = steps.filter((s) => s.id !== ASSEMBLY)
  const move = (index: number, delta: number) => {
    const ids = groupSteps.map((s) => s.id)
    const j = index + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    setGroupOrder(ids)
  }
  const idsOf = (id: string) => [...(steps.find((s) => s.id === id)?.partIds ?? [])]
  // A step: only it in 3D, selected and zoomed in on; tapped again: everything
  const show = (id: string) => {
    if (activeStep === id) {
      setActiveStep(null)
      clearSelection()
    } else {
      setActiveStep(id)
      if (id === ASSEMBLY) clearSelection()
      else select(idsOf(id))
    }
    requestPanel(false)
    // After the panel has closed, so the fit uses the free view
    setTimeout(fitView, 350)
  }
  // ✎: the group in the Delar tab (rename, order the parts)
  const editGroup = (id: string) => {
    setActiveStep(id)
    select(idsOf(id))
    requestPanel(true, 'delar')
    setTimeout(fitView, 350)
  }
  const loose = parts.filter((p) => !p.groupId || !groupSteps.some((s) => s.id === p.groupId))

  return (
    <div className="step-panel">
      {groupSteps.length === 0 && (
        <p className="hint small">Gruppera delar i Skissa (t.ex. Ram, Ben) så blir varje grupp ett eget steg. Nu monteras allt i ett steg.</p>
      )}
      <ol className="step-list">
        {steps.map((s, i) => {
          const isGroup = s.id !== ASSEMBLY
          const own = isGroup ? parts.filter((p) => s.partIds?.has(p.id)) : loose
          const detail = isGroup
            ? partSummary(own)
            : [groupSteps.length ? `Sätt ihop ${groupSteps.map((g) => g.title).join(' + ')}` : 'Sätt ihop allt', loose.length ? `lösa delar: ${partSummary(loose)}` : '']
                .filter(Boolean)
                .join(' · ')
          return (
            <li key={s.id} className={activeStep === s.id ? 'on' : ''}>
              <span className="step-n">{i + 1}</span>
              <button className="step-main" onClick={() => show(s.id)} title="Visa bara det här steget i 3D" aria-pressed={activeStep === s.id}>
                <strong>{s.title}</strong>
                <span className="muted small">{detail}</span>
              </button>
              {isGroup && (
                <span className="step-move">
                  <button aria-label={`Redigera ${s.title}`} title="Byt namn och ordning på delarna" onClick={() => editGroup(s.id)}>
                    <Ic i={L.edit} />
                  </button>
                  <button aria-label={`Flytta ${s.title} tidigare`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <Ic i={L.up} />
                  </button>
                  <button aria-label={`Flytta ${s.title} senare`} disabled={i === groupSteps.length - 1} onClick={() => move(i, 1)}>
                    <Ic i={L.down} />
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <Info label="Hur funkar stegen?">
        <p>
          Varje grupp är ett steg som byggs för sig, sist sätts allt ihop. Ändra ordningen med ↑ ↓ — Steg för steg och skruvlistorna följer
          den. Tryck på ett steg för att zooma in på bara det i 3D, tryck igen för att se allt. ✎ öppnar gruppen under
          Delar, där du byter namn och ordning på delarna. Skruvarna ändrar du under Detaljer → Fogar.
        </p>
      </Info>
    </div>
  )
}
