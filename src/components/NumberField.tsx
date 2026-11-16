import { useEffect, useState } from 'react'

/** A number input that only commits on blur/Enter, so typing doesn't spam undo history. */
export function NumberField({
  value,
  onCommit,
  min,
  step = 1,
  suffix,
}: {
  value: number
  onCommit: (v: number) => void
  min?: number
  step?: number
  suffix?: string
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])

  const commit = () => {
    const v = Number(text.replace(',', '.'))
    if (Number.isFinite(v) && (min === undefined || v >= min) && v !== value) onCommit(v)
    else setText(String(value))
  }

  return (
    <span className="number-field">
      <input
        inputMode="decimal"
        value={text}
        step={step}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setText(String(value))
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  )
}
