/**
 * Line icons for the 3D view's tools, drawn like the ⤢ / ⛶ glyphs next to
 * them: thin strokes in the current text colour (shapes after Lucide, ISC).
 */
import type { ReactNode } from 'react'

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg className="tool-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}

export const IconTools = () => (
  <Svg>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Svg>
)
export const IconClose = () => (
  <Svg>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)
export const IconRuler = () => (
  <Svg>
    <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z" />
    <path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2" />
  </Svg>
)
export const IconSteps = () => (
  <Svg>
    <path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  </Svg>
)
export const IconXray = () => (
  <Svg>
    <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7Z" />
    <path d="M3.3 7 12 12l8.7-5M12 22V12" strokeDasharray="2 2.5" />
  </Svg>
)
export const IconHide = () => (
  <Svg>
    <path d="M9.9 9.9a3 3 0 1 0 4.2 4.2M10.7 5.1A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13 13 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20" />
  </Svg>
)
export const IconShow = () => (
  <Svg>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)
export const IconIsolate = () => (
  <Svg>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Svg>
)
export const IconLock = () => (
  <Svg>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
)
export const IconUnlock = () => (
  <Svg>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.8-1.2" />
  </Svg>
)
export const IconGroup = () => (
  <Svg>
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
    <path d="M7 15v4a2 2 0 0 0 2 2h2M17 9V5a2 2 0 0 0-2-2h-2" />
  </Svg>
)
export const IconUngroup = () => (
  <Svg>
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
    <path d="M14 4l6 6M20 4l-6 6" />
  </Svg>
)
export const IconMove = () => (
  <Svg>
    <path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3" />
  </Svg>
)
export const IconRotate = () => (
  <Svg>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </Svg>
)
export const IconMirror = () => (
  <Svg>
    <path d="M12 3v18" strokeDasharray="2 2.5" />
    <path d="M9 7 3 17h6V7ZM15 7l6 10h-6V7Z" />
  </Svg>
)
export const IconCopy = () => (
  <Svg>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </Svg>
)
export const IconTrash = () => (
  <Svg>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
  </Svg>
)
/** A screw: head, threaded shank, point */
export const IconScrew = () => (
  <Svg>
    <path d="M7 4h10" />
    <path d="M9 4v2h6V4" />
    <path d="M10 6v11l2 4 2-4V6" />
    <path d="M10 9l4 1.5M10 12l4 1.5M10 15l4 1.5" />
  </Svg>
)
