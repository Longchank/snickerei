import { useMemo, useRef, useState } from 'react'
import { Ic, L } from './Icons'
import { phaseInfo } from '../lib/phases'
import { isLocked } from '../lib/progress'
import { useStore } from '../lib/store'
import { buildTemplate, clampSize, SIZE_LIMITS, TEMPLATES, type TemplateId } from '../lib/templates'
import type { Project } from '../lib/types'

/** Small line drawings of what each template builds */
function TemplatePicture({ id }: { id: TemplateId | 'tom' }) {
  return (
    <svg viewBox="0 0 64 36" className="template-pic" aria-hidden>
      {id === 'bank' && (
        <g fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
          <path d="M6 14 L46 10 L58 13 L18 17 Z" />
          <path d="M18 17 v3 M6 14 v3 L18 20 L58 16 v-3" />
          <path d="M10 18 v12 M18 20 v12 M52 16 v12 M44 15 v9" />
        </g>
      )}
      {id === 'bord' && (
        <g fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
          <path d="M4 10 L42 5 L60 9 L22 14 Z" />
          <path d="M4 10 v2.5 L22 16.5 L60 11.5 V9" />
          <path d="M8 13 v19 M22 17 v17 M56 12 v18 M42 8 v9" />
        </g>
      )}
      {id === 'tom' && <path d="M8 6 h48 v24 h-48 Z" fill="none" stroke="currentColor" strokeWidth={1.6} strokeDasharray="4 4" />}
    </svg>
  )
}

const dateFmt = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' })

/** "Skissa · 14 delar · 🔒 kapning pågår" */
function projectLine(p: Project, mode: Parameters<typeof phaseInfo>[0]) {
  const bits = [phaseInfo(mode).label, `${p.parts.length} ${p.parts.length === 1 ? 'del' : 'delar'}`]
  if (isLocked(p)) bits.push('kapning pågår')
  return bits.join(' · ')
}

/**
 * The start page (owner 2026-11-26): your projects on this device, and a new
 * one from a template (Bänk, Bord) or empty. Every start begins here.
 */
export function Home() {
  const library = useStore((s) => s.library)
  const currentId = useStore((s) => s.currentId)
  const project = useStore((s) => s.project)
  const mode = useStore((s) => s.settings.mode)
  const openProject = useStore((s) => s.openProject)
  const resume = useStore((s) => s.resume)
  const createProject = useStore((s) => s.createProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const [picked, setPicked] = useState<TemplateId | 'tom' | null>(null)
  const [size, setSize] = useState<number[]>([0, 0, 0])
  const [name, setName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [importError, setImportError] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // The open project counts as it is now; the rest as they were left, newest first
  const projects = useMemo(() => {
    const list = Object.entries(library).map(([id, e]) => ({ id, ...e }))
    const open = currentId && (project.parts.length > 0 || library[currentId])
    const rows = list.filter((e) => e.id !== currentId)
    if (open) rows.push({ id: currentId!, project, mode, updatedAt: Date.now() })
    return rows.sort((a, b) => b.updatedAt - a.updatedAt)
  }, [library, currentId, project, mode])

  const pick = (id: TemplateId | 'tom') => {
    setPicked(picked === id ? null : id)
    const t = TEMPLATES.find((x) => x.id === id)
    if (t) setSize([...t.size])
    setName('')
  }
  const create = () => {
    if (!picked) return
    if (picked === 'tom') createProject({ name: name.trim() || 'Nytt projekt', parts: [], groups: [], measurements: [] })
    else createProject(buildTemplate(picked, size, name))
  }
  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      const p: Project | undefined = data?.project
      if (!p || !Array.isArray(p.parts)) throw new Error('fel format')
      setImportError(false)
      createProject(p)
    } catch {
      setImportError(true)
    }
  }
  const labels = ['Längd', 'Djup', 'Höjd']

  return (
    <div className="home">
      <header className="home-head">
        <h1>Snickerei</h1>
        <p className="muted">Skissa, räkna och bygg – från idé till verkstad.</p>
      </header>

      {projects.length > 0 && (
        <section className="home-section">
          <h2>Mina projekt</h2>
          <ul className="project-list">
            {projects.map((e) => (
              <li key={e.id}>
                {confirmDelete === e.id ? (
                  <div className="project-confirm">
                    <span>Ta bort «{e.project.name}»? Det går inte att ångra.</span>
                    <button className="danger" onClick={() => (deleteProject(e.id), setConfirmDelete(null))}>
                      Ta bort
                    </button>
                    <button onClick={() => setConfirmDelete(null)}>Avbryt</button>
                  </div>
                ) : (
                  <>
                    <button className="project-open" onClick={() => (e.id === currentId ? resume() : openProject(e.id))}>
                      <strong>{e.project.name}</strong>
                      <span className="muted small">
                        {projectLine(e.project, e.mode)}
                        {e.id === currentId ? ' · öppet nu' : ` · ${dateFmt.format(e.updatedAt)}`}
                      </span>
                    </button>
                    <button className="icon" aria-label={`Ta bort ${e.project.name}`} title="Ta bort" onClick={() => setConfirmDelete(e.id)}>
                      <Ic i={L.trash} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="home-section">
        <h2>Vad ska du bygga?</h2>
        <div className="template-grid">
          {[...TEMPLATES.map((t) => ({ id: t.id as TemplateId | 'tom', name: t.name, hint: t.hint })), { id: 'tom' as const, name: 'Tomt projekt', hint: 'Börja från noll' }].map((t) => (
            <button key={t.id} className={`template ${picked === t.id ? 'on' : ''}`} aria-pressed={picked === t.id} onClick={() => pick(t.id)}>
              <TemplatePicture id={t.id} />
              <strong>{t.name}</strong>
              <span className="muted small">{t.hint}</span>
            </button>
          ))}
        </div>
        {picked && (
          <form
            className="template-form"
            onSubmit={(ev) => {
              ev.preventDefault()
              create()
            }}
          >
            <label className="field">
              <span>Namn</span>
              <input
                id="template-name"
                value={name}
                placeholder={picked === 'tom' ? 'Nytt projekt' : TEMPLATES.find((t) => t.id === picked)?.name}
                onChange={(ev) => setName(ev.target.value)}
              />
            </label>
            {picked !== 'tom' && (
              <div className="template-sizes">
                {labels.map((label, i) => (
                  <label key={label} className="field">
                    <span>{label}</span>
                    <span className="with-unit">
                      <input
                        id={`template-size-${i}`}
                        type="number"
                        inputMode="numeric"
                        min={SIZE_LIMITS[i][0]}
                        max={SIZE_LIMITS[i][1]}
                        value={size[i] || ''}
                        onChange={(ev) => setSize(size.map((v, j) => (j === i ? Number(ev.target.value) : v)))}
                        onBlur={() => setSize(clampSize(size))}
                      />
                      <span className="muted">mm</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {picked !== 'tom' && <p className="hint small">Yttermått. Allt går att ändra efteråt – det här är bara en start.</p>}
            <button type="submit" className="primary">
              <Ic i={L.add} /> Skapa {picked === 'tom' ? 'projekt' : TEMPLATES.find((t) => t.id === picked)?.name.toLowerCase()}
            </button>
          </form>
        )}
      </section>

      <section className="home-section">
        <button onClick={() => fileInput.current?.click()}>
          <Ic i={L.import} /> Importera projektfil
        </button>
        {importError && <p className="warn small">Kunde inte läsa filen. Är det en Snickerei-projektfil?</p>}
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(ev) => {
            const f = ev.target.files?.[0]
            if (f) importFile(f)
            ev.target.value = ''
          }}
        />
        <p className="hint small">Projekten sparas bara i den här webbläsaren. Exportera en projektfil (menyn i ett projekt) om du vill ha en kopia.</p>
      </section>
    </div>
  )
}
