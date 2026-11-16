import { CATEGORY_NAMES, PROFILES, SHEET_CATEGORIES, shortName } from '../lib/catalog'
import { useStore } from '../lib/store'
import type { ProfileCategory } from '../lib/types'

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
  const parts = useStore((s) => s.project.parts)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)

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

      <h2>Delar ({parts.length})</h2>
      {parts.length === 0 ? (
        <p className="hint">Inga delar än.</p>
      ) : (
        <ul className="part-list">
          {parts.map((p) => (
            <li key={p.id}>
              <button className={p.id === selectedId ? 'active' : ''} onClick={() => select(p.id)}>
                <span>{p.name}</span>
                <span className="muted">
                  {p.width === undefined ? p.length : `${p.length}×${p.width}`} mm
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
