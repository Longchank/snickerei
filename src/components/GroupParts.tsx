import { useState } from 'react'
import { getProfile, shortName } from '../lib/catalog'
import { useStore } from '../lib/store'
import type { Part } from '../lib/types'
import { zoomToParts } from './Viewport'

/** A name field that saves on Enter or when leaving it (one undo step), Esc cancels */
function NameInput({ value, label, onSave, className }: { value: string; label: string; onSave: (v: string) => void; className?: string }) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  const shown = editing ? draft : value
  const commit = () => {
    setEditing(false)
    const v = draft.trim()
    if (v && v !== value) onSave(v)
  }
  return (
    <input
      className={`name-input ${className ?? ''}`}
      aria-label={label}
      value={shown}
      onFocus={() => {
        setDraft(value)
        setEditing(true)
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setDraft(value)
          setEditing(false)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

const sizeOf = (p: Part) => {
  const prof = getProfile(p.profileId)
  return prof.kind === 'sheet' ? `${shortName(prof)} · ${Math.round(p.length)} × ${Math.round(p.width ?? 0)}` : `${prof.name} × ${Math.round(p.length)}`
}

/**
 * Montering → Delar (owner 2026-11-22): what's selected, as a group — its
 * name as the header and its parts below, in build order. Rename the group
 * and its parts, change the order of the parts. Nothing selected: nothing
 * here. One part: shown the same way, on its own. With Steg för steg on a
 * group's step, that group. The panel stays open.
 */
export function GroupParts() {
  const parts = useStore((s) => s.project.parts)
  const groups = useStore((s) => s.project.groups)
  const selection = useStore((s) => s.selection)
  const renameGroup = useStore((s) => s.renameGroup)
  const updatePart = useStore((s) => s.updatePart)
  const reorderParts = useStore((s) => s.reorderParts)

  // Steg för steg on a group's step: that group, whatever is selected
  const activeStep = useStore((s) => s.activeStep)
  const stepGroup = groups.find((g) => g.id === activeStep && parts.some((p) => p.groupId === g.id))
  const sel = new Set(stepGroup ? parts.filter((p) => p.groupId === stepGroup.id).map((p) => p.id) : selection)
  const chosen = parts.filter((p) => sel.has(p.id))
  if (!chosen.length) return <p className="hint">Markera en grupp i 3D — eller tryck ✎ under Steg.</p>

  // One group (all of the selection in it): that group
  const groupIds = new Set(chosen.map((p) => p.groupId))
  const group = stepGroup ?? (groupIds.size === 1 && chosen.length > 1 ? groups.find((g) => g.id === chosen[0].groupId) : undefined)
  const single = chosen.length === 1 ? chosen[0] : undefined
  const list = group ? parts.filter((p) => p.groupId === group.id) : chosen

  const move = (index: number, delta: number) => {
    const ids = list.map((p) => p.id)
    const j = index + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    reorderParts(ids)
  }

  return (
    <div className="group-parts">
      <div className="group-head">
        {group ? (
          <NameInput key={group.id} className="group-name" label="Gruppens namn" value={group.name} onSave={(name) => renameGroup(group.id, name)} />
        ) : single ? (
          <NameInput key={single.id} className="group-name" label="Delens namn" value={single.name} onSave={(name) => updatePart(single.id, { name })} />
        ) : (
          <strong className="group-name">{chosen.length} delar</strong>
        )}
        <span className="muted small">{single ? sizeOf(single) : `${list.length} delar`}</span>
      </div>
      {!single && (
        <ol className="group-part-list">
          {list.map((p, i) => (
            <li key={p.id}>
              <button className="step-n" title="Visa delen i 3D" aria-label={`Visa ${p.name} i 3D`} onClick={() => zoomToParts([p.id])}>
                {i + 1}
              </button>
              <span className="group-part-main">
                <NameInput label={`Namn, del ${i + 1}`} value={p.name} onSave={(name) => updatePart(p.id, { name })} />
                <span className="muted small">{sizeOf(p)}</span>
              </span>
              <span className="step-move">
                <button aria-label={`Flytta ${p.name} tidigare`} disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button aria-label={`Flytta ${p.name} senare`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
