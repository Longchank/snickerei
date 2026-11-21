import { useMemo, useState } from 'react'
import { getProfile, hasGrain } from '../lib/catalog'
import { findCornerPartner } from '../lib/corner'
import { endName } from '../lib/ends'
import { miterCorner } from '../lib/cuts'
import type { AxisBox } from '../lib/geometry'
import { describeNotch, overlapsOf, toLocalBox, trimAgainst, unionBox } from '../lib/joints'
import { activePrices, useSelectedParts, useStore } from '../lib/store'
import { stockOptions } from '../lib/cutlist'
import type { EndCut, Part, Profile } from '../lib/types'
import { Fold } from './Fold'
import { Info } from './Info'
import { MeasurePanel } from './MeasurePanel'
import { NumberField } from './NumberField'

const fmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')

export function Inspector() {
  const selected = useSelectedParts()
  const measureMode = useStore((s) => s.measureMode)
  if (measureMode) return <MeasurePanel />
  if (selected.length === 0) {
    return (
      <div className="inspector empty">
        <p className="hint">Tryck på en del i 3D-vyn för att ändra längd, ändar och fogar.</p>
        <Shortcuts />
      </div>
    )
  }
  return selected.length === 1 ? <SinglePart part={selected[0]} /> : <MultipleParts parts={selected} />
}

/** Outer size of the selection. Moving and turning happen in the 3D view (Bygg). */
function Placement({ parts }: { parts: Part[] }) {
  const box = unionBox(parts)!
  const size = [0, 1, 2].map((i) => box.max[i] - box.min[i])
  return (
    <div className="field">
      <span>Yttermått</span>
      <span className="muted">{size.map(fmt).join(' × ')} mm</span>
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
  const sheetSizes = useSheetSizes(prof)

  return (
    <div className="inspector">
      <div className="inspector-head dim-head">
        {prof.kind === 'sheet' ? (
          <div className="dim-line" aria-label="Mått">
            <strong>{prof.name}</strong>
            <span className="dim-x">·</span>
            <NumberField value={part.length} min={1} onCommit={(length) => updatePart(part.id, { length })} />
            <span className="dim-x">×</span>
            <NumberField
              value={part.width ?? prof.width}
              min={1}
              suffix="mm"
              onCommit={(width) => updatePart(part.id, { width })}
            />
          </div>
        ) : (
          <div className="dim-line" aria-label="Mått">
            <strong title="Tvärsnittet är låst">{prof.name}</strong>
            <span className="dim-x">×</span>
            <NumberField value={part.length} min={1} suffix="mm" onCommit={(length) => updatePart(part.id, { length })} />
          </div>
        )}
        {group && (
          <button
            className="chip group-chip"
            title={`Del av gruppen ${group.name} — tryck för att markera hela gruppen`}
            onClick={() => select(parts.filter((p) => p.groupId === group.id).map((p) => p.id))}
          >
            ▣ {group.name}
          </button>
        )}
        <button className="icon" onClick={clearSelection} aria-label="Avmarkera">
          ✕
        </button>
      </div>
      {prof.kind === 'sheet' && sheetSizes.length > 0 && (
        <p className="hint small tight">Butiken: {sheetSizes.map((x) => x.join('×')).join(', ')} mm</p>
      )}
      {hasGrain(prof) && (
        <div className="field compact-field">
          <span>Fiber</span>
          <div className="segmented" role="group" aria-label="Fiberriktning">
            {(
              [
                [undefined, 'Valfri'],
                ['length', 'Längs'],
                ['width', 'Tvärs'],
              ] as const
            ).map(([g, label]) => (
              <button
                key={label}
                className={part.grain === g ? 'on' : ''}
                aria-pressed={part.grain === g}
                onClick={() => updatePart(part.id, { grain: g })}
                title={g ? `Fibrerna går ${label.toLowerCase()} delens längd` : 'Delen får vändas fritt i skärschemat'}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <Ends part={part} />
      <Joints part={part} />
      <Rip part={part} />
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
  const status = overlaps.length ? (
    <span className="fold-bad">⚠ {overlaps.length} {overlaps.length === 1 ? 'krock' : 'krockar'}</span>
  ) : (
    `${part.notches!.length} urtag`
  )
  return (
    <Fold id="del-joints" title="Fogar" status={status} defaultOpen className="joints">
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
    </Fold>
  )
}

/** Sheet sizes on offer: from supplier prices when there are any, else the catalog's. */
function useSheetSizes(prof: Profile): [number, number][] {
  const ownPrices = useStore((s) => s.ownPrices)
  const useExamplePrices = useStore((s) => s.useExamplePrices)
  const supplierFiles = useStore((s) => s.supplierFiles)
  const disabledSuppliers = useStore((s) => s.disabledSuppliers)
  const ownSheetSizes = useStore((s) => s.ownSheetSizes)
  return useMemo(() => {
    if (prof.kind !== 'sheet') return []
    const prices = activePrices({ ownPrices, useExamplePrices, supplierFiles, disabledSuppliers })
    // Largest first, at most three
    return [...stockOptions(prof, prices, { sheets: ownSheetSizes }).sheets].sort((a, b) => b[0] * b[1] - a[0] * a[1]).slice(0, 3)
  }, [prof, ownPrices, useExamplePrices, supplierFiles, disabledSuppliers, ownSheetSizes])
}

const canMiter = (a: Part, b: Part, box: AxisBox) => miterCorner(a, b, box, toLocalBox) !== null

type EndKind = 'rak' | 'face' | 'edge'

const END_LABEL: Record<EndKind, string> = { rak: 'Rak', face: 'Gering', edge: 'Högkant' }

/** Square, miter or bevel at each end, with an angle and which side keeps the long point. */
function Ends({ part }: { part: Part }) {
  const setEndCut = useStore((s) => s.setEndCut)
  const parts = useStore((s) => s.project.parts)
  const ends = part.ends ?? [null, null]
  // Ends that meet another board's end at a corner are cut to match it
  const partners = useMemo(
    () => ([0, 1] as const).map((i) => findCornerPartner(part, i, parts)),
    [part, parts],
  )
  const kindOf = (i: 0 | 1): EndKind => (ends[i]?.angle ? ends[i]!.plane : 'rak')
  const status = ([0, 1] as const)
    .map((i) => (kindOf(i) === 'rak' ? 'Rak' : `${END_LABEL[kindOf(i)]} ${Math.abs(ends[i]!.angle)}°`))
    .join(' · ')
  return (
    <Fold id="del-ends" title="Ändar" status={status} defaultOpen className="ends">
      {([0, 1] as const).map((i) => {
        const cut = ends[i]
        const kind = kindOf(i)
        const angle = Math.abs(cut?.angle ?? 45)
        const sign = (cut?.angle ?? 1) < 0 ? -1 : 1
        const set = (plane: EndCut['plane'], a: number, sg: number) => setEndCut(part.id, i, { plane, angle: a * sg })
        const name = `${endName(part, i)} änden`
        return (
          <div key={i} className="end-line">
            <span className="end-tag" title={name}>
              {endName(part, i)}
            </span>
            <div className="segmented small-seg" role="group" aria-label={name}>
              {(['rak', 'face', 'edge'] as const).map((k) => (
                <button
                  key={k}
                  className={kind === k ? 'on' : ''}
                  aria-pressed={kind === k}
                  onClick={() => (k === 'rak' ? setEndCut(part.id, i, null) : set(k, angle, sign))}
                >
                  {END_LABEL[k]}
                </button>
              ))}
            </div>
            {kind !== 'rak' && cut && !partners[i] && (
              <div className="end-angle">
                <NumberField value={angle} min={0} suffix="°" onCommit={(a) => set(cut.plane, Math.min(80, a), sign)} />
                <button onClick={() => set(cut.plane, angle, -sign)} title="Vänd vinkeln åt andra hållet" aria-label="Vänd vinkeln">
                  ⇅
                </button>
              </div>
            )}
            {partners[i] && (
              <span className="end-partner small" title="Båda ändarna anpassas; längderna ändras inte — en bräda kan flyttas">
                ↔ hörn mot {partners[i]!.part.name}
                {kind === 'rak' ? ', går igenom' : ''}
              </span>
            )}
          </div>
        )
      })}
      <Info label="Rak, gering, högkant?">
        <p>Ändarna är märkta på brädan i 3D-vyn.</p>
        <p>
          <strong>Rak</strong>: kapad 90°. <strong>Gering</strong>: snett över bredsidan, som i hörnet på en tavelram.{' '}
          <strong>Högkant</strong>: snett över smalsidan — sågas med brädan på högkant. ⇅ vänder vinkeln.
        </p>
        <p>
          Möter änden en annan brädas ände i ett hörn anpassas båda; längderna ändras inte — en bräda kan flyttas. Med
          snett snitt mäts längden på långsidan.
        </p>
      </Info>
    </Fold>
  )
}

/** Rip the part lengthwise at an angle into two pieces — a French cleat. */
function Rip({ part }: { part: Part }) {
  const frenchCleat = useStore((s) => s.frenchCleat)
  const [angle, setAngle] = useState(45)
  if (part.rip) {
    return (
      <Fold id="del-rip" title="Klyvning" status={`Fransk list ${part.rip.half === 0 ? 'A' : 'B'} · ${part.rip.angle}°`} className="ends">
        <p className="hint small">
          Halva {part.rip.half === 0 ? 'A' : 'B'} av en bräda klyvd på längden i {part.rip.angle}° (fransk list). Räknas som en
          bräda i såglistan.
        </p>
      </Fold>
    )
  }
  return (
    <Fold id="del-rip" title="Klyvning" status="Fransk list" className="ends">
      <div className="end-angle">
        <NumberField value={angle} min={0} suffix="°" onCommit={(a) => setAngle(Math.min(75, a))} />
        <button onClick={() => frenchCleat(part.id, angle)}>Gör fransk list</button>
      </div>
      <p className="hint small">Klyver delen på längden till två listar med sned kant (A och B).</p>
    </Fold>
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
      <p className="hint small names-line" title={parts.map((p) => p.name).join(', ')}>
        {parts.map((p) => p.name).join(', ')}
      </p>

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
