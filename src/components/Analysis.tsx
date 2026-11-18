import { useEffect, useMemo, useState } from 'react'
import { PURPOSES, STATUS_COLOR, STATUS_LABEL, analyse, type Status } from '../lib/strength'
import { useSelectedParts, useStore } from '../lib/store'
import type { Purpose } from '../lib/types'
import { SpaceInfo } from './MeasurePanel'

const fmt = (v: number, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('sv-SE')

function Dot({ status }: { status: Status }) {
  return <span className="status-dot" style={{ background: STATUS_COLOR[status] }} aria-label={STATUS_LABEL[status]} />
}

/**
 * Strength estimates for the whole build (weight, tipping, wobble, sag and
 * capacity per horizontal part) plus free space and guideline values for the
 * selection. Everything is labelled as an estimate.
 */
export function Analysis() {
  const parts = useStore((s) => s.project.parts)
  const purpose = useStore((s) => s.project.purpose ?? 'forvaring')
  const setPurpose = useStore((s) => s.setPurpose)
  const analysisView = useStore((s) => s.analysisView)
  const setAnalysisView = useStore((s) => s.setAnalysisView)
  const select = useStore((s) => s.select)
  const setMeasureMode = useStore((s) => s.setMeasureMode)
  const selected = useSelectedParts()
  const a = useMemo(() => analyse(parts, purpose), [parts, purpose])
  const preset = PURPOSES[purpose]
  const rank = { bad: 0, warn: 1, ok: 2 }
  const beams = [...a.beams].sort((x, y) => rank[x.status] - rank[y.status] || y.sag / y.sagLimit - x.sag / x.sagLimit)
  const counts = { ok: 0, warn: 0, bad: 0 }
  beams.forEach((b) => counts[b.status]++)
  a.posts.forEach((p) => counts[p.status]++)
  const strength: Status = counts.bad || a.floating.length ? 'bad' : counts.warn ? 'warn' : 'ok'
  const names = new Map(parts.map((p) => [p.id, p.name]))
  const ownLoads = new Map(parts.filter((p) => p.loadKg !== undefined).map((p) => [p.id, p.loadKg!]))

  if (!parts.length) {
    return (
      <div className="inspector analysis">
        <h2>Analys</h2>
        <p className="hint">Bygg något först — sedan visas vikt, hållfasthet, tippning och stabilitet här.</p>
      </div>
    )
  }

  return (
    <div className="inspector analysis">
      <h2>Analys</h2>
      <p className="purpose-label">Vad ska det bli?</p>
      <div className="purpose-chips" role="group" aria-label="Användning">
        {(Object.keys(PURPOSES) as Purpose[]).map((k) => (
          <button key={k} className={`chip ${purpose === k ? 'on' : ''}`} aria-pressed={purpose === k} onClick={() => setPurpose(k)}>
            {PURPOSES[k].label}
          </button>
        ))}
      </div>
      <p className="hint small">
        Räknar med {preset.kgPerM2} kg/m² på fria ytor ({preset.hint})
        {preset.pointKg ? `, eller ${preset.pointKg} kg på ett ställe` : ''}
        {preset.longTerm ? ', som ligger kvar länge (träet kryper)' : ''}.
      </p>

      <button className={`analysis-view ${analysisView ? 'on' : ''}`} aria-pressed={analysisView} onClick={() => setAnalysisView(!analysisView)}>
        {analysisView ? '✓ Färgar modellen' : '🎨 Visa i 3D-vyn'}
      </button>

      <ul className="analysis-summary">
        <li>
          <span className="sum-label">Vikt</span>
          <strong>{fmt(a.weightKg, 1)} kg</strong>
        </li>
        <li>
          <span className="sum-label">
            <Dot status={strength} /> Hållfasthet
          </span>
          <strong>
            {strength === 'ok'
              ? 'Allt håller'
              : `${counts.bad + a.floating.length ? `${counts.bad + a.floating.length} för svaga` : ''}${counts.bad + a.floating.length && counts.warn ? ', ' : ''}${counts.warn ? `${counts.warn} gränsfall` : ''}`}
          </strong>
        </li>
        {a.tip && (
          <li>
            <span className="sum-label">
              <Dot status={a.tip.status} /> Tippning
            </span>
            <strong>
              {a.tip.pushKg <= 0
                ? 'Välter av sig själv'
                : a.tip.status === 'ok'
                  ? `Stabil (${fmt(a.tip.pushKg)} kg knuff)`
                  : `Välter ${a.tip.direction} vid ${fmt(a.tip.pushKg, 1)} kg knuff upptill`}
            </strong>
          </li>
        )}
        {a.rack && (
          <li>
            <span className="sum-label">
              <Dot status={a.rack.status} /> Vickning
            </span>
            <strong>{a.rack.unbraced.length ? `Kan vicka ${a.rack.unbraced.join(' och ')}` : 'Stagad'}</strong>
          </li>
        )}
      </ul>

      {a.tip && a.tip.status !== 'ok' && (
        <p className="hint small advice">
          Fäst {a.tip.height > 1000 ? 'den i väggen' : 'den i golv eller vägg'}, gör foten bredare eller lägg tyngd längst ner.
        </p>
      )}
      {a.rack && a.rack.unbraced.length > 0 && (
        <p className="hint small advice">
          Ramar av stolpar och reglar vickar lätt i sidled. En skiva i ryggen eller sidan, en snedsträva eller vinkeljärn i
          hörnen stagar upp.
        </p>
      )}
      {!a.onFloor && <p className="hint small advice">Inget står på golvet — tippning räknas inte.</p>}

      {(beams.length > 0 || a.floating.length > 0) && (
        <>
          <h3>Liggande delar</h3>
          <ul className="beam-list">
            {a.floating.map((id) => (
              <li key={id}>
                <button onClick={() => select([id])}>
                  <span className="beam-name">
                    <Dot status="bad" /> {names.get(id)}
                  </span>
                  <span className="muted small">Vilar inte på något</span>
                </button>
              </li>
            ))}
            {beams.map((b) => (
              <li key={b.partId}>
                <button onClick={() => select([b.partId])}>
                  <span className="beam-name">
                    <Dot status={b.status} /> {b.name}
                  </span>
                  <span className="beam-facts small">
                    {b.cantilever ? 'Utstick' : 'Spännvidd'} {fmt(b.span)} mm · böjer {fmt(b.sag, 1)} mm
                    <span className="muted"> (ok upp till {fmt(b.sagLimit, 1)})</span>
                  </span>
                  <span className="beam-facts small">
                    {b.loadKg > 0.5 ? `Bär ${fmt(b.loadKg)} kg · ` : ''}
                    {b.capacityKg < 0.5 ? (
                      <strong>{b.capacityBy === 'sag' ? 'böjer redan för mycket' : 'redan överbelastad'}</strong>
                    ) : (
                      <>
                        klarar ca {fmt(b.capacityKg)} kg till {b.cantilever ? 'ytterst' : 'mitt på'}
                        <span className="muted"> ({b.capacityBy === 'sag' ? 'innan den böjer för mycket' : 'innan virket blir för hårt belastat'})</span>
                      </>
                    )}
                  </span>
                </button>
                <OwnLoad partId={b.partId} value={ownLoads.get(b.partId)} />
              </li>
            ))}
          </ul>
        </>
      )}

      {a.posts.length > 0 && (
        <>
          <h3>Ben och stolpar</h3>
          <ul className="beam-list">
            {[...a.posts]
              .sort((x, y) => y.utilisation - x.utilisation)
              .map((p) => (
                <li key={p.partId}>
                  <button onClick={() => select([p.partId])}>
                    <span className="beam-name">
                      <Dot status={p.status} /> {p.name}
                    </span>
                    <span className="beam-facts small">
                      Bär {fmt(p.loadKg)} kg · klarar ca {fmt(p.capacityKg)} kg
                      <span className="muted">
                        {' '}
                        ({p.capacityBy === 'buckling' ? `innan den knäcks, ${fmt(p.height)} mm hög` : 'innan virket trycks ihop'})
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}

      <p className="hint small disclaimer">
        Uppskattning med typvärden för virket (t.ex. C24) och enkla balkformler. Skruvar, lim, urtag och sneda snitt räknas
        inte. Bygg med marginal — det här är ingen hållfasthetsberäkning för bärande konstruktioner.
      </p>

      <h3>Markerat</h3>
      {selected.length ? (
        <SpaceInfo parts={selected} />
      ) : (
        <p className="hint small">Markera en del för att se fritt utrymme runt den och riktvärden, t.ex. bordshöjd.</p>
      )}
      <button className="analysis-measure" onClick={() => setMeasureMode(true)}>
        📏 Mät mellan ytor
      </button>
    </div>
  )
}

/** Own load on one part, kg; empty = follow "Vad ska det bli?" */
function OwnLoad({ partId, value }: { partId: string; value?: number }) {
  const updatePart = useStore((s) => s.updatePart)
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => setText(value === undefined ? '' : String(value)), [value])
  const commit = () => {
    const t = text.trim().replace(',', '.')
    const v = t === '' ? undefined : Number(t)
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) return setText(value === undefined ? '' : String(value))
    if (v !== value) updatePart(partId, { loadKg: v })
  }
  return (
    <label className="own-load">
      <span>Egen last</span>
      <input
        inputMode="decimal"
        placeholder="enligt valet"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <span className="muted">kg</span>
    </label>
  )
}
