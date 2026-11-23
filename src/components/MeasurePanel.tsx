import { useMemo, useState } from 'react'
import { Info } from './Info'
import { matchGuides, offBy, seatsText, type GuideMatch, type MeasureKind } from '../lib/ergonomics'
import { unionBox } from '../lib/joints'
import { freeSpace, measureValue, otherBoxes } from '../lib/measure'
import { useStore } from '../lib/store'
import { SNAP_LABEL } from '../lib/snap'
import type { Measurement, Part } from '../lib/types'

const fmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')

const KIND_LABEL: Record<MeasureKind, string> = {
  height: 'Höjd från golvet',
  vgap: 'Fritt mellan, lodrätt',
  horizontal: 'Avstånd, vågrätt',
}

/** Up to three guideline matches: ✓ inside the range, ≈ close to it. */
export function GuideList({ value, kind, limit = 3 }: { value: number; kind: MeasureKind; limit?: number }) {
  const matches = matchGuides(value, kind).slice(0, limit)
  if (!matches.length) return <p className="muted small guide-none">Inga vanliga riktvärden i närheten.</p>
  return (
    <ul className="guides">
      {matches.map((m) => (
        <GuideLine key={m.guide.label} m={m} value={value} />
      ))}
    </ul>
  )
}

function GuideLine({ m, value }: { m: GuideMatch; value: number }) {
  const off = offBy(value, m.guide)
  const range = m.guide.min === 0 ? `upp till ${fmt(m.guide.max)}` : `${fmt(m.guide.min)}–${fmt(m.guide.max)}`
  return (
    <li className={m.fit}>
      <span className="guide-mark">{m.fit === 'ok' ? '✓' : '≈'}</span>
      <span>
        {m.guide.label} <span className="muted">({range} mm)</span>
        {off !== 0 && (
          <span className="muted"> · {off < 0 ? `${fmt(-off)} mm för lågt/kort` : `${fmt(off)} mm för högt/långt`}</span>
        )}
        {m.guide.note && <span className="muted small block">{m.guide.note}</span>}
      </span>
    </li>
  )
}

const pointLabel = (p: Measurement['a']) =>
  p.floor ? 'golvet' : !p.snap || p.snap === 'face' ? 'ytan' : SNAP_LABEL[p.snap].toLowerCase()

/** What each end snapped to, and the straight-line distance when it differs. */
function PointInfo({ m }: { m: Measurement }) {
  const d = [0, 1, 2].map((i) => Math.abs(m.b.point[i] - m.a.point[i]))
  const direct = Math.hypot(d[0], d[1], d[2])
  const { value } = measureValue(m)
  return (
    <p className="muted small point-info">
      Från {pointLabel(m.a)} till {pointLabel(m.b)}
      {Math.abs(direct - value) > 1 && (
        <>
          {' '}
          · rakt avstånd {fmt(direct)} mm (X {fmt(d[0])}, Y {fmt(d[1])}, Z {fmt(d[2])})
        </>
      )}
    </p>
  )
}

/** Measuring mode: the saved measurements, one row each; tap a row for guidelines and details. */
export function MeasurePanel() {
  const measurements = useStore((s) => s.project.measurements)
  const removeMeasurement = useStore((s) => s.removeMeasurement)
  const clearMeasurements = useStore((s) => s.clearMeasurements)
  const setMeasureMode = useStore((s) => s.setMeasureMode)
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="inspector measure-panel">
      <div className="inspector-head">
        <strong className="selection-count">📏 Mät</strong>
        {measurements.length > 0 && (
          <button className="link" onClick={clearMeasurements}>
            Rensa
          </button>
        )}
        <button className="icon bar-close" onClick={() => setMeasureMode(false)} aria-label="Stäng" title="Stäng">
          ✕
        </button>
      </div>
      {measurements.length === 0 && <p className="hint small">Inga mått än — tryck på två ytor i 3D-vyn.</p>}
      <ol className="measure-list">
        {measurements.map((m, i) => {
          const { value, kind } = measureValue(m)
          const best = matchGuides(value, kind)[0]
          const isOpen = open === m.id
          return (
            <li key={m.id} className={isOpen ? 'open' : ''}>
              <div className="measure-head">
                <button className="measure-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : m.id)}>
                  <span className="measure-index">{i + 1}</span>
                  <strong>{fmt(value)} mm</strong>
                  <span className="muted small">{KIND_LABEL[kind]}</span>
                </button>
                <button className="link" aria-label={`Ta bort mått ${i + 1}`} onClick={() => removeMeasurement(m.id)}>
                  ✕
                </button>
              </div>
              {!isOpen && best && (
                <p className="measure-best small">
                  <span className={`guide-mark ${best.fit}`}>{best.fit === 'ok' ? '✓' : '≈'}</span> {best.guide.label}
                </p>
              )}
              {isOpen && (
                <>
                  <PointInfo m={m} />
                  <GuideList value={value} kind={kind} />
                  {kind === 'horizontal' && value >= 600 && m.a.snap !== 'center' && m.b.snap !== 'center' && (
                    <p className="muted small">Som bänk eller bordskant: {seatsText(value)} (60 cm/person).</p>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ol>
      <Info label="Hur mäts det?">
        <p>
          Tryck på en yta, sedan en till (eller golvet). Avståndet mäts rakt ut från den första ytan: höjd från golvet, fritt
          mellan två hyllor, längd mellan två sidor. Två tryck på samma yta mäter längs ytan, t.ex. hur lång en sits är.
        </p>
        <p>
          Punkten fäster mot hörn, kantmitt, ytans mitt och delens mitt (c/c) — knappen överst i vyn byter fästpunkt. Tryck på
          ett mått för riktvärden: vanliga mått för möbler, inte krav.
        </p>
      </Info>
    </div>
  )
}

const DIR_LABEL = { under: 'Under', över: 'Ovanför', vänster: 'Vänster', höger: 'Höger', bakom: 'Bakom', framför: 'Framför' }

/** Free space around the selection, and how its height compares to guidelines. */
export function SpaceInfo({ parts }: { parts: Part[] }) {
  const all = useStore((s) => s.project.parts)
  const box = unionBox(parts)
  const spaces = useMemo(
    () => (box ? freeSpace(box, otherBoxes(all, new Set(parts.map((p) => p.id)))) : []),
    [box?.min.join(), box?.max.join(), all, parts],
  )
  if (!box) return null
  const top = box.max[1]
  const longest = Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2])
  const under = spaces.find((f) => f.direction === 'under')

  return (
    <section className="space-info">
      <h3>Fritt utrymme och riktvärden</h3>
      {spaces.length > 0 ? (
        <ul className="spaces">
          {spaces.map((f) => (
            <li key={f.direction}>
              <span className="free-dot" /> {DIR_LABEL[f.direction]}: <strong>{fmt(f.gap)} mm</strong>{' '}
              <span className="muted small">till {f.to}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Inga delar i närheten.</p>
      )}
      <p className="small">
        Ovansidan är <strong>{fmt(top)} mm</strong> över golvet:
      </p>
      <GuideList value={top} kind="height" />
      {under && under.to === 'golvet' && box.min[1] >= 300 && (
        <>
          <p className="small">Fritt under ner till golvet: {fmt(under.gap)} mm</p>
          <GuideList value={under.gap} kind="vgap" limit={1} />
        </>
      )}
      {longest >= 1200 && (
        <p className="muted small">
          Längsta sidan {fmt(longest)} mm: {seatsText(longest)} bredvid varandra.
        </p>
      )}
    </section>
  )
}
