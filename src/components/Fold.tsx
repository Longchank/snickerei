import { useState, type ReactNode } from 'react'

const OPEN_KEY = 'snickerei-open-folds'
const CLOSED_KEY = 'snickerei-closed-folds'
function read(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]')
  } catch {
    return []
  }
}
function remember(key: string, id: string, on: boolean) {
  try {
    const rest = read(key).filter((x) => x !== id)
    localStorage.setItem(key, JSON.stringify(on ? [...rest, id] : rest))
  } catch {
    /* storage unavailable: just don't remember */
  }
}

/**
 * A section that folds away and remembers, on this device, whether it was
 * left open. `status` is a short summary shown on the closed header (e.g.
 * "Rak · Gering 45°"), so most of the time it doesn't need opening.
 */
export function Fold({
  id,
  title,
  children,
  count,
  status,
  defaultOpen = false,
  className = '',
}: {
  id: string
  title: ReactNode
  children: ReactNode
  count?: number
  status?: ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(() => (defaultOpen ? !read(CLOSED_KEY).includes(id) : read(OPEN_KEY).includes(id)))
  return (
    <details
      className={`fold ${className}`}
      open={open}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open
        setOpen(now)
        if (defaultOpen) remember(CLOSED_KEY, id, !now)
        else remember(OPEN_KEY, id, now)
      }}
    >
      <summary>
        <span>{title}</span>
        {status !== undefined ? (
          <span className="fold-status">{status}</span>
        ) : (
          count !== undefined && <span className="muted small">{count}</span>
        )}
      </summary>
      {open && children}
    </details>
  )
}
