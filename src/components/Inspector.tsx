import { useMemo, useState } from 'react'
import { getProfile } from '../lib/catalog'
import { miterCorner } from '../lib/cuts'
import type { AxisBox } from '../lib/geometry'
import { describeNotch, overlapsOf, toLocalBox, trimAgainst, unionBox } from '../lib/joints'
import { useSelectedParts, useStore } from '../lib/store'
import type { EndCut, Part, Vec3 } from '../lib/types'
import { NumberField } from './NumberField'

const AXES = ['X', 'Y', 'Z'] as const
const fmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')

export function Inspector() {
  const selected = useSelectedParts()
  if (selected.length === 0) {
    return (
      <div className="inspector empty">
        <p className="hint">
          Tryck på en del i 3D-vyn eller i listan för att ändra den. Slå på <strong>Flera</strong> i 3D-vyn för att
          markera flera delar.
        </p>
        <Shortcuts />
      </div>
    )
  }
  return selected.length === 1 ? <SinglePart part={selected[0]} /> : <MultipleParts parts={selected} />
}

/** Position (min corner of the selection) with −/+ nudges, and quarter-turn rotation. */
function Placement({ parts }: { parts: Part[] }) {
  const moveSelection = useStore((s) => s.moveSelection)
  const rotateSelection = useStore((s) => s.rotateSelection)
  const snap = useStore((s) => s.settings.snap)
  const box = unionBox(parts)!
  const step = Math.max(1, snap)
  const size = [0, 1, 2].map((i) => box.max[i] - box.min[i])
  const moveAxis = (i: number, by: number) => {
    const d: Vec3 = [0, 0, 0]
    d[i] = by
    moveSelection(d)
  }

  return (
    <>
      <div className="field top">
        <span>Position</span>
        <div className="xyz">
          {AXES.map((a, i) => (
            <div key={a} className="axis-row">
              <em className={`axis-${a.toLowerCase()}`}>{a}</em>
              <button className="step" aria-label={`${a} minus ${step} mm`} onClick={() => moveAxis(i, -step)}>
                −
              </button>
              <NumberField value={box.min[i]} onCommit={(v) => moveAxis(i, v - box.min[i])} />
              <button className="step" aria-label={`${a} plus ${step} mm`} onClick={() => moveAxis(i, step)}>
                +
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Rotera 90°</span>
        <div className="buttons">
          {AXES.map((a, i) => (
            <button key={a} onClick={() => rotateSelection(i as 0 | 1 | 2)}>
              ↻ {a}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Yttermått</span>
        <span className="muted">{size.map(fmt).join(' × ')} mm</span>
      </div>
    </>
  )
}

function Actions() {
  const duplicateSelection = useStore((s) => s.duplicateSelection)
  const removeSelection = useStore((s) => s.removeSelection)
  return (
    <div className="buttons">
      <button onClick={duplicateSelection}>Duplicera</button>
      <button className="danger" onClick={removeSelection}>
        Ta bort
      </button>
    </div>
  )
}

function SinglePart({ part }: { part: Part }) {
  const updatePart = useStore((s) => s.updatePart)
  const clearSelection = useStore((s) => s.clearSelection)
  const select = useStore((s) => s.select)
  const parts = useStore((s) => s.project.parts)
  const group = useStore((s) => s.project.groups.find((g) => g.id === part.groupId))
  const prof = getProfile(part.profileId)
  const maxSheet = prof.stockSheets[0]

  return (
    <div className="inspector">
      <div className="inspector-head">
        <input
          key={`${part.id}|${part.name}`}
          className="part-name"
          aria-label="Namn"
          defaultValue={part.name}
          onBlur={(e) => e.target.value !== part.name && updatePart(part.id, { name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <button className="icon" onClick={clearSelection} aria-label="Avmarkera">
          ✕
        </button>
      </div>
      {group && (
        <p className="hint small">
          Del av gruppen <strong>{group.name}</strong>.{' '}
          <button
            className="link inline"
            onClick={() => select(parts.filter((p) => p.groupId === group.id).map((p) => p.id))}
          >
            Markera hela gruppen
          </button>
        </p>
      )}

      <div className="field">
        <span>{prof.kind === 'sheet' ? 'Material' : 'Dimension'}</span>
        <strong>
          {prof.kind === 'sheet' ? prof.name : `${prof.name} mm`}{' '}
          <span className="muted">({prof.kind === 'sheet' ? 'tjocklek låst' : 'låst'})</span>
        </strong>
      </div>
      <label className="field">
        <span>Längd</span>
        <NumberField value={part.length} min={1} suffix="mm" onCommit={(length) => updatePart(part.id, { length })} />
      </label>
      {prof.kind === 'sheet' && (
        <label className="field">
          <span>Bredd</span>
          <NumberField
            value={part.width ?? prof.width}
            min={1}
            suffix="mm"
            onCommit={(width) => updatePart(part.id, { width })}
          />
        </label>
      )}
      {prof.kind === 'sheet' && maxSheet && <p className="hint small">Skivan säljs i {maxSheet.join(' × ')} mm.</p>}

      <Placement parts={[part]} />
      <Actions />
      <Ends part={part} />
      <Rip part={part} />
      <Joints part={part} />
      <Shortcuts />
    </div>
  )
}

/** Overlaps with other parts and what to do about them, plus existing notches. */
function Joints({ part }: { part: Part }) {
  const parts = useStore((s) => s.project.parts)
  const trimTo = useStore((s) => s.trimTo)
  const notchWith = useStore((s) => s.notchWith)
  const halfLapWith = useStore((s) => s.halfLapWith)
  const removeNotch = useStore((s) => s.removeNotch)
  const miterWith = useStore((s) => s.miterWith)
  const overlaps = useMemo(() => overlapsOf(part, parts), [part, parts])

  if (!overlaps.length && !part.notches?.length) return null
  return (
    <section className="joints">
      <h3>Fogar</h3>
      {overlaps.map(({ other, box }) => {
        const canTrim = trimAgainst(part, box) !== null
        const dims = [0, 1, 2].map((i) => fmt(box.max[i] - box.min[i])).join(' × ')
        return (
          <div key={other.id} className="overlap">
            <p>
              <span className="overlap-dot" /> Går in i <strong>{other.name}</strong>{' '}
              <span className="muted small">({dims} mm)</span>
            </p>
            <div className="buttons">
              <button
                onClick={() => trimTo(part.id, other.id)}
                disabled={!canTrim}
                title={canTrim ? 'Korta delen så den slutar mot den andra' : 'Den andra delen korsar mitten'}
              >
                Kapa mot
              </button>
              <button onClick={() => notchWith(part.id, other.id)} title="Ta ur den andra delens form ur denna">
                Urtag
              </button>
              <button onClick={() => halfLapWith(part.id, other.id)} title="Halva djupet ur varje del">
                Halvt i halvt
              </button>
              <button
                onClick={() => miterWith(part.id, other.id)}
                disabled={!canMiter(part, other, box)}
                title="Geringa hörnet: båda delarna kapas snett så de möts i diagonalen"
              >
                Gering
              </button>
            </div>
          </div>
        )
      })}
      {part.notches?.map((n, i) => (
        <div key={i} className="notch">
          <span className="small">{describeNotch(part, n)}</span>
          <button className="link" aria-label="Ta bort urtaget" onClick={() => removeNotch(part.id, i)}>
            ✕
          </button>
        </div>
      ))}
    </section>
  )
}

const canMiter = (a: Part, b: Part, box: AxisBox) => miterCorner(a, b, box, toLocalBox) !== null

type EndKind = 'rak' | 'face' | 'edge'

/** Square, miter or bevel at each end, with an angle and which side keeps the long point. */
function Ends({ part }: { part: Part }) {
  const setEndCut = useStore((s) => s.setEndCut)
  const ends = part.ends ?? [null, null]
  return (
    <section className="ends">
      <h3>Ändar</h3>
      {([0, 1] as const).map((i) => {
        const cut = ends[i]
        const kind: EndKind = cut?.angle ? cut.plane : 'rak'
        const angle = Math.abs(cut?.angle ?? 45)
        const sign = (cut?.angle ?? 1) < 0 ? -1 : 1
        const set = (plane: EndCut['plane'], a: number, sg: number) => setEndCut(part.id, i, { plane, angle: a * sg })
        return (
          <div key={i} className="end-row">
            <span className="end-label">{i === 0 ? 'Början' : 'Slutet'}</span>
            <div className="segmented" role="group" aria-label={i === 0 ? 'Början' : 'Slutet'}>
              {(
                [
                  ['rak', 'Rak'],
                  ['face', 'Gering'],
                  ['edge', 'Fas'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  className={kind === k ? 'on' : ''}
                  aria-pressed={kind === k}
                  onClick={() => (k === 'rak' ? setEndCut(part.id, i, null) : set(k, angle, sign))}
                >
                  {label}
                </button>
              ))}
            </div>
            {kind !== 'rak' && cut && (
              <div className="end-angle">
                <NumberField value={angle} min={0} suffix="°" onCommit={(a) => set(cut.plane, Math.min(80, a), sign)} />
                <button onClick={() => set(cut.plane, angle, -sign)} title="Vänd vinkeln åt andra hållet">
                  ⇅ Vänd
                </button>
              </div>
            )}
          </div>
        )
      })}
      {part.ends?.some((e) => e?.angle) && <p className="hint small">Längden mäts på långsidan.</p>}
    </section>
  )
}

/** Rip the part lengthwise at an angle into two pieces — a French cleat. */
function Rip({ part }: { part: Part }) {
  const frenchCleat = useStore((s) => s.frenchCleat)
  const [angle, setAngle] = useState(45)
  if (part.rip) {
    return (
      <section className="ends">
        <h3>Klyvning</h3>
        <p className="hint small">
          Halva {part.rip.half === 0 ? 'A' : 'B'} av en bräda klyvd på längden i {part.rip.angle}° (fransk list).
          Räknas som en bräda i såglistan.
        </p>
      </section>
    )
  }
  return (
    <section className="ends">
      <h3>Klyvning</h3>
      <div className="end-row">
        <span className="end-label">Vinkel</span>
        <div className="end-angle">
          <NumberField value={angle} min={0} suffix="°" onCommit={(a) => setAngle(Math.min(75, a))} />
          <button onClick={() => frenchCleat(part.id, angle)}>Gör fransk list</button>
        </div>
      </div>
      <p className="hint small">Klyver delen på längden till två listar med sned kant (A och B).</p>
    </section>
  )
}

function MultipleParts({ parts }: { parts: Part[] }) {
  const clearSelection = useStore((s) => s.clearSelection)
  const groupSelection = useStore((s) => s.groupSelection)
  const ungroup = useStore((s) => s.ungroup)
  const renameGroup = useStore((s) => s.renameGroup)
  const allParts = useStore((s) => s.project.parts)
  const groups = useStore((s) => s.project.groups)
  const [name, setName] = useState('')

  // Exactly one whole group selected?
  const gid = parts[0].groupId
  const group =
    gid && parts.every((p) => p.groupId === gid) && allParts.filter((p) => p.groupId === gid).length === parts.length
      ? groups.find((g) => g.id === gid)
      : undefined

  return (
    <div className="inspector">
      <div className="inspector-head">
        {group ? (
          <input
            key={`${group.id}|${group.name}`}
            className="part-name"
            aria-label="Gruppens namn"
            defaultValue={group.name}
            onBlur={(e) => e.target.value !== group.name && renameGroup(group.id, e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <strong className="selection-count">{parts.length} delar markerade</strong>
        )}
        <button className="icon" onClick={clearSelection} aria-label="Avmarkera">
          ✕
        </button>
      </div>
      <p className="hint small">{parts.map((p) => p.name).join(', ')}</p>

      {group ? (
        <div className="buttons group-actions">
          <span className="muted small">Grupp med {parts.length} delar</span>
          <button onClick={() => ungroup(group.id)}>Dela upp grupp</button>
        </div>
      ) : (
        <form
          className="group-form"
          onSubmit={(e) => {
            e.preventDefault()
            groupSelection(name || 'Grupp')
            setName('')
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Namn, t.ex. Ben" aria-label="Gruppnamn" />
          <button type="submit">Gruppera</button>
        </form>
      )}

      <Placement parts={parts} />
      <Actions />
      <Shortcuts />
    </div>
  )
}

function Shortcuts() {
  return (
    <dl className="shortcuts desktop-only">
      <dt>Dra pilarna</dt>
      <dd>Flytta (fäster mot andra delar)</dd>
      <dt>Shift/Ctrl+klick</dt>
      <dd>Markera flera</dd>
      <dt>R</dt>
      <dd>Rotera runt Y</dd>
      <dt>Ctrl+D</dt>
      <dd>Duplicera</dd>
      <dt>Ctrl+G</dt>
      <dd>Gruppera</dd>
      <dt>Delete</dt>
      <dd>Ta bort</dd>
      <dt>Ctrl+Z / Ctrl+Y</dt>
      <dd>Ångra / gör om</dd>
      <dt>Esc</dt>
      <dd>Avmarkera</dd>
    </dl>
  )
}
