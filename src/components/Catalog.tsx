import { Fold } from './Fold'
import { Info } from './Info'
import { CATEGORY_NAMES, getProfile, PROFILES, SHEET_CATEGORIES, shortName } from '../lib/catalog'
import { useStore } from '../lib/store'
import type { Part, ProfileCategory } from '../lib/types'

const BOARD_CATEGORIES = (Object.keys(CATEGORY_NAMES) as ProfileCategory[]).filter(
  (c) => !SHEET_CATEGORIES.includes(c),
)

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

export function Catalog({ parts = true }: { parts?: boolean }) {
  return (
    <div className="catalog">
      <h2>Virke</h2>
      <Info>
        Välj en bräda och tryck sedan där den ska sitta på modellen — vid början, mitten eller änden av en annan bräda,
        eller på golvet. Tvärsnittet är låst — bara längden kan ändras. Skivor läggs med två tryck, hörn till hörn; deras
        tjocklek är låst men längd och bredd är fria.
      </Info>
      {BOARD_CATEGORIES.map((cat) => (
        <Category key={cat} cat={cat} />
      ))}
      <h2>Skivor</h2>
      {SHEET_CATEGORIES.map((cat) => (
        <Category key={cat} cat={cat} />
      ))}
      {parts && <PartList />}
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
  const unlockParts = useStore((s) => s.unlockParts)
  const selected = new Set(selection)

  const item = (p: Part) => (
    <li key={p.id} className={p.locked ? 'locked' : undefined}>
      {p.locked && (
        <button className="unlock" onClick={() => unlockParts([p.id])} title="Lås upp" aria-label={`Lås upp ${p.name}`}>
          🔒
        </button>
      )}
      <button
        disabled={p.locked}
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
