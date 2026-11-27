import { createContext, useContext, type ReactNode } from 'react'
import { Ic, L } from './Icons'
import { useStore } from '../lib/store'
import type { CheckList } from '../lib/progress'

/** A big round check-off button (≥ 40 px), with its own label for screen readers */
export function CheckButton({ done, label, onToggle }: { done: boolean; label: string; onToggle: () => void }) {
  return (
    <button className={`check-btn ${done ? 'done' : ''}`} role="checkbox" aria-checked={done} aria-label={label} title={label} onClick={onToggle}>
      {done && <Ic i={L.ok} size={18} />}
    </button>
  )
}

/** One list's check-offs from the project */
export function useChecks(list: CheckList) {
  const checks = useStore((s) => s.project.checks?.[list])
  const toggle = useStore((s) => s.toggleCheck)
  const done = new Set(checks ?? [])
  return { done: (key: string) => done.has(key), toggle: (key: string) => toggle(list, key), count: done.size }
}

/**
 * The shopping list's check-offs, for list parts shared with the printout:
 * where this is provided, rows get a check button; in the printout they don't.
 */
const BuyCheck = createContext<{ done: (k: string) => boolean; toggle: (k: string) => void } | null>(null)
const BuyPrefix = createContext('')

export function BuyChecks({ children }: { children: ReactNode }) {
  const c = useChecks('buy')
  return <BuyCheck.Provider value={c}>{children}</BuyCheck.Provider>
}
export const BuyScope = BuyPrefix.Provider

/** A shopping-list line: checkable when inside BuyChecks */
export function BuyItem({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const c = useContext(BuyCheck)
  const prefix = useContext(BuyPrefix)
  if (!c) return <>{children}</>
  const key = prefix ? `${prefix}|${id}` : id
  const done = c.done(key)
  return (
    <span className={`buy-item ${done ? 'done' : ''}`}>
      <CheckButton done={done} label={`${done ? 'Köpt' : 'Bocka av'}: ${label}`} onToggle={() => c.toggle(key)} />
      <span className="buy-text">{children}</span>
    </span>
  )
}

/**
 * The model is locked while pieces are checked off as cut (owner
 * 2026-11-26). Changing it, or going back to Skissa/Detaljer, asks first:
 * unlocking empties the cut checklist.
 */
export function LockDialog() {
  const prompt = useStore((s) => s.lockPrompt)
  const cut = useStore((s) => s.project.checks?.cut?.length ?? 0)
  const close = useStore((s) => s.closeLockPrompt)
  const unlock = useStore((s) => s.unlockModel)
  const setMode = useStore((s) => s.setMode)
  if (!prompt) return null
  const go = prompt.mode
  return (
    <div className="lock-backdrop" onClick={close}>
      <div className="lock-dialog" role="alertdialog" aria-modal="true" aria-labelledby="lock-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="lock-title">
          <Ic i={L.lock} /> Modellen är låst
        </h3>
        <p>
          Du har bockat av {cut} {cut === 1 ? 'bit' : 'bitar'} som kapade. För att ändra modellen måste den låsas upp — då töms
          kaplistan, eftersom den inte längre stämmer.
        </p>
        <div className="lock-actions">
          <button
            className="primary"
            onClick={() => {
              unlock()
              if (go) setMode(go, true)
            }}
          >
            <Ic i={L.unlock} /> Lås upp och töm kaplistan
          </button>
          {go && (
            <button onClick={() => setMode(go, true)}>
              <Ic i={L.show} /> Bara titta
            </button>
          )}
          <button onClick={close}>Avbryt</button>
        </div>
      </div>
    </div>
  )
}
