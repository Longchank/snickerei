import type { StockBoard, StockSheet } from '../lib/cutlist'

/** One stock board as a bar: cuts in wood colour, waste hatched. */
export function BoardBar({ board }: { board: StockBoard }) {
  return (
    <div className="board-bar">
      {board.cuts.map((c, j) => (
        <span key={j} style={{ flexGrow: c }} title={`${c} mm`}>
          {c}
        </span>
      ))}
      <span className="waste" style={{ flexGrow: board.waste }} title={`Spill ${board.waste} mm`} />
    </div>
  )
}

/** A stock sheet seen from above with the pieces nested on it. */
export function SheetDiagram({ sheet }: { sheet: StockSheet }) {
  const label = (w: number, h: number) => `${w}×${h}`
  return (
    <svg
      className="sheet-diagram"
      viewBox={`0 0 ${sheet.length} ${sheet.width}`}
      role="img"
      aria-label={`Skiva ${sheet.length}×${sheet.width} mm med ${sheet.pieces.length} delar`}
    >
      <defs>
        {/* Grain along the sheet's length, for pieces whose grain is locked */}
        <pattern id="grain" width={60} height={40} patternUnits="userSpaceOnUse">
          <rect width={60} height={40} className="sheet-piece-fill" />
          <line x1={0} y1={20} x2={60} y2={20} className="grain-line" />
        </pattern>
      </defs>
      <rect className="sheet-bg" x={0} y={0} width={sheet.length} height={sheet.width} />
      {sheet.pieces.map((p, i) => {
        const fontSize = Math.min(90, p.w / 6, p.h / 2.2)
        return (
          <g key={i}>
            <rect
              className="sheet-piece"
              x={p.x}
              y={p.y}
              width={p.w}
              height={p.h}
              style={p.grainLocked ? { fill: 'url(#grain)' } : undefined}
            />
            {fontSize > 25 && (
              <text x={p.x + p.w / 2} y={p.y + p.h / 2} fontSize={fontSize} textAnchor="middle" dominantBaseline="central">
                {label(p.w, p.h)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
