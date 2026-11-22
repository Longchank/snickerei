import { useMemo, useState } from 'react'
import { SCREW_COLORS, screwJoints, screwName, screwSections, screwTotals, sizeOptions, type Joint } from '../lib/screws'
import { useStore } from '../lib/store'
import { Dot } from './ScrewList'
import { Fold } from './Fold'
import { Info } from './Info'

const mm = (v: number) => v.toFixed(1).replace('.', ',')

/**
 * Montering → Skruv: editing the screws, joint by joint (owner 2026-11-22,
 * "crud style"). Read: every joint by build step, or only the selection's.
 * Update: count and size. Delete: switch a joint's screws off (or remove one
 * added by hand). Create: screws between two parts the app didn't pair up.
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
  const [adding, setAdding] = useState(false)

  if (parts.length < 2) return <p className="hint">Bygg något först — sedan kan du ändra skruvarna här.</p>

  // Something selected in 3D: only its joints
  const sel = new Set(selection)
  const shown = selection.length ? joints.filter((j) => sel.has(j.through.id) || sel.has(j.into.id)) : joints
  const sections = screwSections(shown, groups)
  const count = joints.reduce((n, j) => n + j.count, 0)
  const changed = joints.filter((j) => j.custom || j.manual).length

  return (
    <div className="screw-editor">
      <div className="list-summary">
        <strong>
          {count} skruv · {joints.filter((j) => j.count).length} fogar
        </strong>
        {changed > 0 && <span className="muted small">{changed} ändrade</span>}
        <button className={adding ? 'on' : ''} aria-expanded={adding} onClick={() => setAdding(!adding)}>
          + Ny fog
        </button>
      </div>
      {adding && <NewJoint onDone={() => setAdding(false)} existing={new Set(joints.map((j) => j.key))} />}
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
          limmas). ↺ går tillbaka till förslaget. Markera en del i 3D för att bara se dess fogar. Tryck på en skruv i 3D för
          att flytta, lägga till eller ta bort just den — ändrar du antalet här placeras fogens skruvar om automatiskt.
        </p>
        <p>"+ Ny fog" lägger till skruv mellan två delar som appen inte har parat ihop. Allt går att ångra.</p>
      </Info>
    </div>
  )
}

function JointRow({ j, color }: { j: Joint; color?: string }) {
  const edit = useStore((s) => s.project.screwEdits?.[j.key])
  const setScrewEdit = useStore((s) => s.setScrewEdit)
  const select = useStore((s) => s.select)
  const requestPanel = useStore((s) => s.requestPanel)
  const sizeValue = edit?.d && edit.length ? `${edit.d}x${edit.length}` : ''
  const options = sizeOptions(j.screw)
  return (
    <li className={`edit-joint${j.off ? ' off' : ''}`}>
      <div className="edit-joint-head">
        <button
          className="link joint-name"
          title="Visa delarna i 3D"
          onClick={() => {
            select([j.through.id, j.into.id])
            requestPanel(false)
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
            ↺ Skruva igen
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
              −
            </button>
            <strong>{j.count}</strong>
            <button aria-label="Fler skruv" disabled={j.count >= 20} onClick={() => setScrewEdit(j.key, { count: j.count + 1, points: undefined })}>
              +
            </button>
          </span>
          {j.custom && !j.manual && (
            <button className="icon-btn" title={`Tillbaka till förslaget (${j.suggested} st)`} aria-label="Tillbaka till förslaget" onClick={() => setScrewEdit(j.key, null)}>
              ↺
            </button>
          )}
          <button
            className="icon-btn danger"
            title={j.manual ? 'Ta bort fogen' : 'Ingen skruv i den här fogen'}
            aria-label={j.manual ? 'Ta bort fogen' : 'Ta bort skruvarna'}
            onClick={() => setScrewEdit(j.key, j.manual ? null : { off: true })}
          >
            🗑
          </button>
        </div>
      )}
    </li>
  )
}

/** "+ Ny fog": screws from one part into another, chosen from lists (the selection first) */
function NewJoint({ onDone, existing }: { onDone: () => void; existing: Set<string> }) {
  const parts = useStore((s) => s.project.parts)
  const selection = useStore((s) => s.selection)
  const setScrewEdit = useStore((s) => s.setScrewEdit)
  const sel = new Set(selection)
  const ordered = [...parts.filter((p) => sel.has(p.id)), ...parts.filter((p) => !sel.has(p.id))]
  const [through, setThrough] = useState(ordered[0]?.id ?? '')
  const [into, setInto] = useState(ordered[1]?.id ?? '')
  const [count, setCount] = useState(2)
  const key = `${through}|${into}`
  const reverse = `${into}|${through}`
  const dup = existing.has(key) || existing.has(reverse)
  const options = ordered.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name}
    </option>
  ))
  return (
    <div className="new-joint">
      <label>
        <span>Genom</span>
        <select value={through} onChange={(e) => setThrough(e.target.value)}>
          {options}
        </select>
      </label>
      <label>
        <span>In i</span>
        <select value={into} onChange={(e) => setInto(e.target.value)}>
          {options}
        </select>
      </label>
      <div className="new-joint-row">
        <span className="screw-stepper" role="group" aria-label="Antal skruv">
          <button aria-label="Färre skruv" disabled={count <= 1} onClick={() => setCount(count - 1)}>
            −
          </button>
          <strong>{count}</strong>
          <button aria-label="Fler skruv" disabled={count >= 20} onClick={() => setCount(count + 1)}>
            +
          </button>
        </span>
        <button
          className="primary"
          disabled={!through || !into || through === into || dup}
          onClick={() => {
            setScrewEdit(key, { manual: true, count })
            onDone()
          }}
        >
          Lägg till
        </button>
      </div>
      {through === into && <p className="hint small">Välj två olika delar.</p>}
      {dup && <p className="hint small">De här delarna har redan en fog — ändra den i listan.</p>}
    </div>
  )
}
