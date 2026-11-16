import { getProfile } from '../lib/catalog'
import { worldSize } from '../lib/geometry'
import { useStore } from '../lib/store'
import { NumberField } from './NumberField'

export function Inspector() {
  const part = useStore((s) => s.project.parts.find((p) => p.id === s.selectedId))
  const updatePart = useStore((s) => s.updatePart)
  const rotate = useStore((s) => s.rotate)
  const removePart = useStore((s) => s.removePart)
  const duplicatePart = useStore((s) => s.duplicatePart)

  if (!part) {
    return (
      <div className="inspector empty">
        <p className="hint">Markera en del i 3D-vyn eller i listan för att ändra den.</p>
        <Shortcuts />
      </div>
    )
  }

  const prof = getProfile(part.profileId)
  const size = worldSize(part)
  const axes = ['X', 'Y', 'Z'] as const

  return (
    <div className="inspector">
      <label className="field">
        <span>Namn</span>
        <input
          key={part.id}
          defaultValue={part.name}
          onBlur={(e) => e.target.value !== part.name && updatePart(part.id, { name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>

      <div className="field">
        <span>Dimension</span>
        <strong>
          {prof.name} mm <span className="muted">(låst)</span>
        </strong>
      </div>

      <label className="field">
        <span>Längd</span>
        <NumberField value={part.length} min={1} suffix="mm" onCommit={(length) => updatePart(part.id, { length })} />
      </label>

      <div className="field">
        <span>Position</span>
        <div className="xyz">
          {axes.map((a, i) => (
            <label key={a}>
              <em>{a}</em>
              <NumberField
                value={part.position[i]}
                onCommit={(v) => {
                  const position = [...part.position] as typeof part.position
                  position[i] = v
                  updatePart(part.id, { position })
                }}
              />
            </label>
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
    <dl className="shortcuts">
      <dt>Dra pilarna</dt>
      <dd>Flytta</dd>
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
