import { useMemo } from 'react'
import { Ic, L } from './Icons'
import { jointStep, planScrews, RESET, SCREW_COLORS, screwJoints, screwName, screwSections, screwTotals, sizeOptions, type Joint } from '../lib/screws'
import { useStore } from '../lib/store'
import { Dot, MoreAboutScrews } from './ScrewList'
import { Fold } from './Fold'
import { Info } from './Info'
import { fitView } from './Viewport'
import type { Vec3 } from '../lib/types'

const mm = (v: number) => v.toFixed(1).replace('.', ',')

/**
 * Montering → Skruv: editing the screws, joint by joint (owner 2026-11-22,
 * "crud style"). Read: every joint by build step, or only the selection's.
 * Update: count and size. Delete: switch a joint's screws off (or remove one
 * added by hand). Create: "Ny fog" — tap a face in 3D (JointBar).
 */
export function ScrewEditor() {
  const parts = useStore((s) => s.project.parts)
  const groups = useStore((s) => s.project.groups)
  const edits = useStore((s) => s.project.screwEdits)
  const selection = useStore((s) => s.selection)
  const clearSelection = useStore((s) => s.clearSelection)
  const joints = useMemo(() => screwJoints(parts, edits), [parts, edits])
  const totals = useMemo(() => screwTotals(joints), [joints])
  const colorOf = new Map(totals.map((t, i) => [screwName(t.screw), SCREW_COLORS[i % SCREW_COLORS.length]]))
  const setJointMode = useStore((s) => s.setJointMode)
  const requestPanel = useStore((s) => s.requestPanel)
  const activeStep = useStore((s) => s.activeStep)
  const fillScrews = useStore((s) => s.fillScrews)
  // What "✦ Fyll i" would add: planned as a whole (no screws into each other, no needless end-grain joints)
  const planned = useMemo(
    () => Object.keys(planScrews(parts, edits ?? {}, groups.map((g) => g.id), selection.length ? new Set(selection) : undefined)).length,
    [parts, edits, groups, selection],
  )

  if (parts.length < 2) return <p className="hint">Bygg något först — sedan kan du ändra skruvarna här.</p>

  // Something selected in 3D: only its joints
  const sel = new Set(selection)
  const inStep = activeStep ? joints.filter((j) => jointStep(j) === activeStep) : joints
  const shown = selection.length ? inStep.filter((j) => sel.has(j.through.id) || sel.has(j.into.id)) : inStep
  const sections = screwSections(shown, groups)
  const count = joints.reduce((n, j) => n + j.count, 0)
  const changed = joints.filter((j) => j.custom || j.manual).length

  return (
    <div className="screw-editor">
      <div className="list-summary">
        <strong>
          {count} skruv · {joints.filter((j) => j.count).length} {joints.filter((j) => j.count).length === 1 ? 'fog' : 'fogar'}
        </strong>
        {changed > 0 && <span className="muted small">{changed} ändrade</span>}
        <button
          title="Tryck sedan på ytan där skruvarna ska in"
          onClick={() => {
            setJointMode(true)
            requestPanel(false)
          }}
        >
          <Ic i={L.plus} /> Ny fog
        </button>
      </div>
      {(() => {
        // Planned joints: for the selection if something is selected, else everywhere
        const mine = { length: planned }
        return (
          <>
            {joints.length === 0 && (
              <p className="hint small">Inga fogar än. Tryck "+ Ny fog" och sedan på ytan där skruvarna ska in — eller låt appen fylla i.</p>
            )}
            {mine.length > 0 && (
              <button className="fill-screws" onClick={() => fillScrews(selection.length ? selection : undefined)}>
                ✦ Fyll i rekommenderade ({mine.length} {mine.length === 1 ? 'fog' : 'fogar'}
                {selection.length ? ' för det markerade' : ''})
              </button>
            )}
          </>
        )
      })()}
      {selection.length > 0 && (
        <p className="filter-line small">
          Visar fogar för det markerade ({shown.length}).{' '}
          <button className="link" onClick={clearSelection}>
            Visa alla
          </button>
        </p>
      )}
      {sections.length === 0 && <p className="hint small">Inga skruvfogar här.</p>}
      {sections.map((sec) => (
        <Fold
          key={sec.title}
          id={`screw-edit-${sec.title}`}
          title={sec.title}
          status={`${sec.joints.reduce((n, j) => n + j.count, 0)} skruv`}
          defaultOpen={selection.length > 0 || sections.length === 1}
        >
          <ul className="edit-joints">
            {sec.joints.map((j) => (
              <JointRow key={j.key} j={j} color={colorOf.get(screwName(j.screw))} />
            ))}
          </ul>
        </Fold>
      ))}
      <Info label="Hur ändrar jag?">
        <p>
          ✦ = appens förslag. Ändra antal med − / +, välj en annan skruv i listan, eller tryck 🗑 för att ta bort skruvarna i en fog (t.ex. om den
          limmas). ↺ går tillbaka till förslaget. Markera en del i 3D för att bara se dess fogar. Tryck på en skruv i 3D,
          eller på fogens namn här, för att välja fogen och ändra den: antal, diagonal och skruv.
        </p>
        <p>
          Ett nytt projekt har inga fogar — du lägger till dem. "✦ Fyll i rekommenderade" planerar skruven för hela bygget (eller det
          markerade) i byggordning: inga skruvar som går in i varandra, och inga onödiga skruvar ner i ändträ på delar som redan
          sitter fast. Skivor skruvas aldrig i kanten, den är för spröd.
        </p>
        <p>
          "+ Ny fog": tryck på ytan där skruvarna ska in — delen bakom hittas själv. Skruvarna hamnar där du trycker; välj antal, diagonal och
          skruv; linjen i 3D visar hur långt skruven når (grön = bra, gul = kort, röd = sticker ut). Allt går att ångra.
        </p>
      </Info>
      <MoreAboutScrews />
    </div>
  )
}

function JointRow({ j, color }: { j: Joint; color?: string }) {
  const edit = useStore((s) => s.project.screwEdits?.[j.key])
  const setScrewEdit = useStore((s) => s.setScrewEdit)
  const select = useStore((s) => s.select)
  const requestPanel = useStore((s) => s.requestPanel)
  const focusScrew = useStore((s) => s.focusScrew)
  const sizeValue = edit?.d && edit.length ? `${edit.d}x${edit.length}` : ''
  const options = sizeOptions(j.screw)
  return (
    <li className={`edit-joint${j.off ? ' off' : ''}`}>
      <div className="edit-joint-head">
        <button
          className="link joint-name"
          title="Visa fogen i 3D och ändra den"
          onClick={() => {
            // Zoom in on the joint and open its editor (the panel closes)
            select([j.through.id, j.into.id])
            focusScrew({ key: j.key, index: 0 })
            requestPanel(false)
            const pad = 60
            setTimeout(() => fitView({ min: j.area.min.map((v) => v - pad) as Vec3, max: j.area.max.map((v) => v + pad) as Vec3 }), 350)
          }}
        >
          {j.through.name} → {j.into.name}
        </button>
        {j.manual && <span className="tag">egen</span>}
        {j.custom && !j.off && <span className="tag">ändrad</span>}
      </div>
      {j.off ? (
        <div className="edit-joint-row">
          <span className="muted small">Ingen skruv</span>
          <button className="link" onClick={() => setScrewEdit(j.key, { off: undefined })}>
            <Ic i={L.reset} /> Skruva igen
          </button>
        </div>
      ) : (
        <div className="edit-joint-row">
          <Dot color={color} />
          <select
            aria-label={`Skruv, ${j.through.name} → ${j.into.name}`}
            value={sizeValue}
            onChange={(e) => {
              const [d, length] = e.target.value ? e.target.value.split('x').map(Number) : [undefined, undefined]
              setScrewEdit(j.key, { d, length })
            }}
          >
            <option value="">{sizeValue ? 'Förslag' : `${mm(j.screw.d)}×${j.screw.length} ✦`}</option>
            {options.map((o) => (
              <option key={`${o.d}x${o.length}`} value={`${o.d}x${o.length}`}>
                {mm(o.d)}×{o.length}
              </option>
            ))}
          </select>
          <span className="screw-stepper" role="group" aria-label={`Antal, ${j.through.name} → ${j.into.name}`}>
            <button aria-label="Färre skruv" disabled={j.count <= 1} onClick={() => setScrewEdit(j.key, { count: j.count - 1, points: undefined })}>
              <Ic i={L.minus} />
            </button>
            <strong>{j.count}</strong>
            <button aria-label="Fler skruv" disabled={j.count >= 20} onClick={() => setScrewEdit(j.key, { count: j.count + 1, points: undefined })}>
              <Ic i={L.plus} />
            </button>
          </span>
          {j.custom && !j.manual && (
            <button className="icon-btn" title={`Tillbaka till förslaget (${j.suggested} st)`} aria-label="Tillbaka till förslaget" onClick={() => setScrewEdit(j.key, RESET)}>
              <Ic i={L.reset} />
            </button>
          )}
          <button
            className="icon-btn danger"
            title="Ta bort fogen"
            aria-label="Ta bort fogen"
            onClick={() => setScrewEdit(j.key, null)}
          >
            <Ic i={L.trash} />
          </button>
        </div>
      )}
    </li>
  )
}
