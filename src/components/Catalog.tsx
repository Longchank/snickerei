import { useState, type ReactNode } from 'react'
import { CATEGORY_NAMES, getProfile, PROFILES, SHEET_CATEGORIES, shortName } from '../lib/catalog'
import { useStore } from '../lib/store'
import type { Part, ProfileCategory } from '../lib/types'

const BOARD_CATEGORIES = (Object.keys(CATEGORY_NAMES) as ProfileCategory[]).filter(
  (c) => !SHEET_CATEGORIES.includes(c),
)

const FOLD_KEY = 'snickerei-open-folds'
function readFolds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]')
  } catch {
    return []
  }
}

/** A section that folds away; closed by default, remembers being opened on this device. */
function Fold({ id, title, children, count }: { id: string; title: ReactNode; children: ReactNode; count?: number }) {
  const [open, setOpen] = useState(() => readFolds().includes(id))
  return (
    <details
      className="fold"
      open={open}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open
        setOpen(now)
        try {
          const rest = readFolds().filter((x) => x !== id)
          localStorage.setItem(FOLD_KEY, JSON.stringify(now ? [...rest, id] : rest))
        } catch {
          /* storage unavailable: just don't remember */
        }
      }}
    >
      <summary>
        <span>{title}</span>
        {count !== undefined && <span className="muted small">{count}</span>}
      </summary>
      {open && children}
    </details>
  )
}

function Category({ cat }: { cat: ProfileCategory }) {
  const addPart = useStore((s) => s.addPart)
  const hasParts = useStore((s) => s.project.parts.length > 0)
  const placeProfile = useStore((s) => s.placeProfile)
  const setPlaceProfile = useStore((s) => s.setPlaceProfile)
  // With parts in the model, choosing a board starts placing it by tapping;
  // the very first board just goes in
  // Sheets are always placed corner to corner, even in an empty model
  const choose = (id: string) =>
    !hasParts && getProfile(id).kind !== 'sheet' ? addPart(id) : setPlaceProfile(placeProfile === id ? null : id)
  const profiles = PROFILES.filter((p) => p.category === cat)
  const armed = profiles.some((p) => p.id === placeProfile)
  return (
    <Fold id={`cat-${cat}`} title={<>{CATEGORY_NAMES[cat]}{armed && <span className="fold-armed"> · vald</span>}</>} count={profiles.length}>
      <div className="chips">
        {profiles.map((p) => (
          <button
            key={p.id}
            className={`chip ${placeProfile === p.id ? 'on' : ''}`}
            aria-pressed={placeProfile === p.id}
            onClick={() => choose(p.id)}
            title={`Lägg till ${p.name}`}
          >
            <span className="swatch" style={{ background: p.color }} />
            {shortName(p)}
          </button>
        ))}
      </div>
    </Fold>
  )
}

export function Catalog() {
  return (
    <div className="catalog">
      <h2>Virke</h2>
      <p className="hint">
        Välj en bräda och tryck sedan där den ska sitta på modellen — vid början, mitten eller änden av en annan bräda,
        eller på golvet. Tvärsnittet är låst — bara längden kan ändras.
      </p>
      {BOARD_CATEGORIES.map((cat) => (
        <Category key={cat} cat={cat} />
      ))}
      <h2>Skivor</h2>
      <p className="hint">Tjockleken är låst — längd och bredd är fria.</p>
      {SHEET_CATEGORIES.map((cat) => (
        <Category key={cat} cat={cat} />
      ))}
      <PartList />
    </div>
  )
}

/** All parts, grouped. Tapping a group selects it; tapping a part selects only that part. */
export function PartList() {
  const parts = useStore((s) => s.project.parts)
  const groups = useStore((s) => s.project.groups)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const tapPart = useStore((s) => s.tapPart)
  const multiSelect = useStore((s) => s.multiSelect)
  const selected = new Set(selection)

  const item = (p: Part) => (
    <li key={p.id}>
      <button
        className={selected.has(p.id) ? 'active' : ''}
        onClick={(e) => {
          if (multiSelect || e.shiftKey || e.ctrlKey || e.metaKey) {
            // Toggle just this part, even inside a group
            select(selected.has(p.id) ? selection.filter((x) => x !== p.id) : [...selection, p.id])
          } else select([p.id])
        }}
      >
        <span>
          {p.name}
          {p.notches?.length ? <span className="muted small"> · {p.notches.length} urtag</span> : null}
        </span>
        <span className="muted">{p.width === undefined ? p.length : `${p.length}×${p.width}`} mm</span>
      </button>
    </li>
  )

  return (
    <Fold id="parts" title={<h2>Delar</h2>} count={parts.length}>
      {parts.length === 0 && <p className="hint">Inga delar än.</p>}
      {groups.map((g) => {
        const members = parts.filter((p) => p.groupId === g.id)
        const all = members.every((p) => selected.has(p.id))
        return (
          <div key={g.id} className="part-group">
            <button
              className={`group-head ${all ? 'active' : ''}`}
              onClick={() => members[0] && tapPart(members[0].id, multiSelect)}
            >
              <span>▾ {g.name}</span>
              <span className="muted small">{members.length} delar</span>
            </button>
            <ul className="part-list">{members.map(item)}</ul>
          </div>
        )
      })}
      <ul className="part-list">{parts.filter((p) => !p.groupId).map(item)}</ul>
    </Fold>
  )
}
