import { getProfile } from '../lib/catalog'
import { worldSize } from '../lib/geometry'
import { useStore } from '../lib/store'
import type { Vec3 } from '../lib/types'
import { NumberField } from './NumberField'

export function Inspector() {
  const part = useStore((s) => s.project.parts.find((p) => p.id === s.selectedId))
  const updatePart = useStore((s) => s.updatePart)
  const rotate = useStore((s) => s.rotate)
  const removePart = useStore((s) => s.removePart)
  const duplicatePart = useStore((s) => s.duplicatePart)
  const select = useStore((s) => s.select)
  const snap = useStore((s) => s.settings.snap)

  if (!part) {
    return (
      <div className="inspector empty">
        <p className="hint">Tryck på en del i 3D-vyn eller i listan för att ändra den.</p>
        <Shortcuts />
      </div>
    )
  }

  const prof = getProfile(part.profileId)
  const size = worldSize(part)
  const axes = ['X', 'Y', 'Z'] as const
  const setPos = (i: number, v: number) => {
    const position = [...part.position] as Vec3
    position[i] = v
    updatePart(part.id, { position })
  }
  // Nudge by the snap step, but never less than 1 mm
  const step = Math.max(1, snap)
  const maxSheet = prof.stockSheets[0]

  return (
    <div className="inspector">
      <div className="inspector-head">
        <input
          key={part.id}
          className="part-name"
          aria-label="Namn"
          defaultValue={part.name}
          onBlur={(e) => e.target.value !== part.name && updatePart(part.id, { name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <button className="icon" onClick={() => select(null)} aria-label="Avmarkera">
          ✕
        </button>
      </div>

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
      {prof.kind === 'sheet' && maxSheet && (
        <p className="hint small">Skivan säljs i {maxSheet.join(' × ')} mm.</p>
      )}

      <div className="field top">
        <span>Position</span>
        <div className="xyz">
          {axes.map((a, i) => (
            <div key={a} className="axis-row">
              <em className={`axis-${a.toLowerCase()}`}>{a}</em>
              <button className="step" aria-label={`${a} minus ${step} mm`} onClick={() => setPos(i, part.position[i] - step)}>
                −
              </button>
              <NumberField value={part.position[i]} onCommit={(v) => setPos(i, v)} />
              <button className="step" aria-label={`${a} plus ${step} mm`} onClick={() => setPos(i, part.position[i] + step)}>
                +
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Rotera 90°</span>
        <div className="buttons">
          {axes.map((a, i) => (
            <button key={a} onClick={() => rotate(part.id, i as 0 | 1 | 2)}>
              ↻ {a}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Yttermått</span>
        <span className="muted">
          {size[0]} × {size[1]} × {size[2]} mm
        </span>
      </div>

      <div className="buttons">
        <button onClick={() => duplicatePart(part.id)}>Duplicera</button>
        <button className="danger" onClick={() => removePart(part.id)}>
          Ta bort
        </button>
      </div>
      <Shortcuts />
    </div>
  )
}

function Shortcuts() {
  return (
    <dl className="shortcuts desktop-only">
      <dt>Dra pilarna</dt>
      <dd>Flytta (fäster mot andra delar)</dd>
      <dt>R</dt>
      <dd>Rotera runt Y</dd>
      <dt>Ctrl+D</dt>
      <dd>Duplicera</dd>
      <dt>Delete</dt>
      <dd>Ta bort</dd>
      <dt>Ctrl+Z / Ctrl+Y</dt>
      <dd>Ångra / gör om</dd>
      <dt>Esc</dt>
      <dd>Avmarkera</dd>
    </dl>
  )
}
