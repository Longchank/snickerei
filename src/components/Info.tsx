import type { ReactNode } from 'react'

/** Help text folded behind a small ⓘ, so panels stay short; tap to read */
export function Info({ children, label = 'Hur funkar det?' }: { children: ReactNode; label?: string }) {
  return (
    <details className="info">
      <summary>
        <span className="info-i" aria-hidden>
          i
        </span>
        {label}
      </summary>
      <div className="info-body">{children}</div>
    </details>
  )
}
