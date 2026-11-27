import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useStepWarnings } from './Checklist'
import { Ic, L } from './Icons'
import { PHASES } from '../lib/phases'
import { useStore } from '../lib/store'
import type { Project } from '../lib/types'

const SNAPS = [1, 5, 10, 50, 100]

export function Toolbar({ onPrint }: { onPrint: () => void }) {
  const name = useStore((s) => s.project.name)
  const setProjectName = useStore((s) => s.setProjectName)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)

  return (
    <header className="toolbar">
      <span className="logo" aria-hidden>
        🪚<span className="desktop-only"> Snickerei</span>
      </span>
      <input
        className="project-name"
        value={name}
        onChange={(e) => setProjectName(e.target.value)}
        aria-label="Projektnamn"
      />
      <div className="group">
        <button className="icon" onClick={undo} disabled={!canUndo} title="Ångra (Ctrl+Z)" aria-label="Ångra">
          <Ic i={L.undo} />
        </button>
        <button className="icon" onClick={redo} disabled={!canRedo} title="Gör om (Ctrl+Y)" aria-label="Gör om">
          <Ic i={L.redo} />
        </button>
        <Menu onPrint={onPrint} />
      </div>
      <PhaseBar />
    </header>
  )
}

/** The four steps of a build, each in its own colour */
function PhaseBar() {
  const mode = useStore((s) => s.settings.mode)
  const setMode = useStore((s) => s.setMode)
  const warnings = useStepWarnings()
  return (
    <nav className="phase-bar" aria-label="Steg i bygget">
      {PHASES.map((p) => (
        <button
          key={p.id}
          className={mode === p.id ? 'on' : ''}
          aria-current={mode === p.id ? 'step' : undefined}
          style={{ '--c': p.color, '--c-soft': p.soft } as CSSProperties}
          onClick={() => setMode(p.id)}
          title={p.hint}
          aria-label={`${p.n} ${p.label}${warnings[p.id].length ? `, ${warnings[p.id].length} att rätta` : ''}`}
        >
          <span className="phase-n">{p.n}</span>
          <span className="phase-label">{p.label}</span>
          {warnings[p.id].length > 0 && (
            <span className={`phase-badge ${warnings[p.id].some((i) => i.severity === 'bad') ? 'bad' : ''}`} aria-hidden>
              {warnings[p.id].length}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}

function Menu({ onPrint }: { onPrint: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const goHome = useStore((s) => s.goHome)
  const createProject = useStore((s) => s.createProject)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const exportProject = () => {
    const project = useStore.getState().project
    const blob = new Blob([JSON.stringify({ format: 'snickerei', version: 1, project }, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${project.name || 'projekt'}.snickerei.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const importProject = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      const project: Project | undefined = data?.project
      if (!project || !Array.isArray(project.parts)) throw new Error('fel format')
      createProject(project)
    } catch {
      alert('Kunde inte läsa filen. Är det en Snickerei-projektfil?')
    }
  }

  const act = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <div className="menu" ref={ref}>
      <button className="icon" aria-label="Meny" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Ic i={L.menu} />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <button role="menuitem" onClick={act(goHome)}>
            Mina projekt
          </button>
          <button role="menuitem" onClick={act(onPrint)}>
            Skriv ut / spara PDF
          </button>
          <button role="menuitem" onClick={act(exportProject)}>
            Exportera projektfil
          </button>
          <button role="menuitem" onClick={act(() => fileInput.current?.click())}>
            Importera projektfil
          </button>
          <hr />
          <label className="check">
            <input
              type="checkbox"
              checked={settings.showDimensions}
              onChange={(e) => setSettings({ showDimensions: e.target.checked })}
            />
            Visa mått
          </label>
          <hr />
          <span className="menu-heading">Avancerat</span>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.freeMove}
              onChange={(e) => setSettings({ freeMove: e.target.checked })}
            />
            Fri flytt (dragpilar i 3D)
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.snapToParts}
              onChange={(e) => setSettings({ snapToParts: e.target.checked })}
            />
            Fäst mot andra delar
          </label>
          <div className="menu-row snap-types" role="group" aria-label="Fäst mot">
            <span>Fäst mot</span>
            <div className="snap-type-buttons">
              {(
                [
                  ['vertex', 'Hörn'],
                  ['edge', 'Kanter'],
                  ['face', 'Ytor'],
                  ['center', 'Mitt'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={settings.snapTypes[key] ? 'on' : ''}
                  aria-pressed={settings.snapTypes[key]}
                  onClick={() => setSettings({ snapTypes: { ...settings.snapTypes, [key]: !settings.snapTypes[key] } })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="menu-row">
            Rutnät
            <select value={settings.snap} onChange={(e) => setSettings({ snap: Number(e.target.value) })}>
              {SNAPS.map((s) => (
                <option key={s} value={s}>
                  {s} mm
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) importProject(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
