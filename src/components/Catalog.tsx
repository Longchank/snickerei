import { CATEGORY_NAMES, PROFILES } from '../lib/catalog'
import { useStore } from '../lib/store'
import type { ProfileCategory } from '../lib/types'

export function Catalog() {
  const addPart = useStore((s) => s.addPart)
  const parts = useStore((s) => s.project.parts)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const categories = Object.keys(CATEGORY_NAMES) as ProfileCategory[]

  return (
    <aside className="panel left">
      <h2>Virke</h2>
      <p className="hint">Klicka för att lägga till en bräda. Tvärsnittet är låst — bara längden kan ändras.</p>
      {categories.map((cat) => (
        <section key={cat}>
          <h3>{CATEGORY_NAMES[cat]}</h3>
          <div className="chips">
            {PROFILES.filter((p) => p.category === cat).map((p) => (
              <button key={p.id} className="chip" onClick={() => addPart(p.id)} title={`Lägg till ${p.name}`}>
                <span className="swatch" style={{ background: p.color }} />
                {p.name}
              </button>
            ))}
          </div>
        </section>
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
                <span className="muted">{p.length} mm</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
