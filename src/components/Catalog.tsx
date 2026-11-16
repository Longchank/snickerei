import { CATEGORY_NAMES, PROFILES, SHEET_CATEGORIES, shortName } from '../lib/catalog'
import { useStore } from '../lib/store'
import type { Part, ProfileCategory } from '../lib/types'

const BOARD_CATEGORIES = (Object.keys(CATEGORY_NAMES) as ProfileCategory[]).filter(
  (c) => !SHEET_CATEGORIES.includes(c),
)

function Category({ cat }: { cat: ProfileCategory }) {
  const addPart = useStore((s) => s.addPart)
  return (
    <section>
      <h3>{CATEGORY_NAMES[cat]}</h3>
      <div className="chips">
        {PROFILES.filter((p) => p.category === cat).map((p) => (
          <button key={p.id} className="chip" onClick={() => addPart(p.id)} title={`Lägg till ${p.name}`}>
            <span className="swatch" style={{ background: p.color }} />
            {shortName(p)}
          </button>
        ))}
      </div>
    </section>
  )
}

export function Catalog() {
  return (
    <div className="catalog">
      <h2>Virke</h2>
      <p className="hint">Tvärsnittet är låst — bara längden kan ändras.</p>
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
    <>
      <h2>Delar ({parts.length})</h2>
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
    </>
  )
}
