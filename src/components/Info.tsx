import type { ReactNode } from 'react'
import { Ic, L } from './Icons'

/** Help text folded behind a small ⓘ, so panels stay short; tap to read */
export function Info({ children, label = 'Hur funkar det?' }: { children: ReactNode; label?: string }) {
  return (
    <details className="info">
      <summary>
        <Ic i={L.info} className="info-i" />
        {label}
      </summary>
      <div className="info-body">{children}</div>
    </details>
  )
}
