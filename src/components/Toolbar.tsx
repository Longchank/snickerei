import { useRef } from 'react'
import { useStore } from '../lib/store'
import type { Project } from '../lib/types'

const SNAPS = [1, 5, 10, 50, 100]

export function Toolbar() {
  const name = useStore((s) => s.project.name)
  const setProjectName = useStore((s) => s.setProjectName)
  const newProject = useStore((s) => s.newProject)
  const loadProject = useStore((s) => s.loadProject)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const snap = useStore((s) => s.settings.snap)
  const setSettings = useStore((s) => s.setSettings)
  const fileInput = useRef<HTMLInputElement>(null)

  const exportProject = () => {
    const project = useStore.getState().project
    const blob = new Blob([JSON.stringify({ format: 'snickerei', version: 1, project }, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${project.name || 'projekt'}.snickerei.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importProject = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      const project: Project | undefined = data?.project
      if (!project || !Array.isArray(project.parts)) throw new Error('fel format')
      loadProject(project)
    } catch {
      alert('Kunde inte läsa filen. Är det en Snickerei-projektfil?')
    }
  }

  return (
    <header className="toolbar">
      <span className="logo">🪚 Snickerei</span>
      <input className="project-name" value={name} onChange={(e) => setProjectName(e.target.value)} aria-label="Projektnamn" />
      <div className="group">
        <button
          onClick={() => {
            if (confirm('Börja ett nytt projekt? Det nuvarande försvinner om du inte har exporterat det.')) newProject()
          }}
        >
          Nytt
        </button>
        <button onClick={exportProject}>Exportera</button>
        <button onClick={() => fileInput.current?.click()}>Importera</button>
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
      <div className="group">
        <button onClick={undo} disabled={!canUndo} title="Ångra (Ctrl+Z)">
          ↶ Ångra
        </button>
        <button onClick={redo} disabled={!canRedo} title="Gör om (Ctrl+Y)">
          ↷ Gör om
        </button>
      </div>
      <label className="group snap">
        Fäst mot
        <select value={snap} onChange={(e) => setSettings({ snap: Number(e.target.value) })}>
          {SNAPS.map((s) => (
            <option key={s} value={s}>
              {s} mm
            </option>
          ))}
        </select>
      </label>
    </header>
  )
}
