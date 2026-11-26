/**
 * The four steps of a build (owner 2026-11-20; reordered 2026-11-26 to follow
 * how you actually build: sketch → details → shop → workshop). Each step is a way of working:
 * what a tap in 3D does, which panels there are, and a colour that tints the
 * whole app so it's always clear which step you're in. Steps are views, not
 * gates — the model can be changed in any of them. Add a step by adding an
 * entry here (and its panels in App.tsx).
 */
import type { Phase } from './types'

export interface PhaseInfo {
  id: Phase
  n: number
  label: string
  /** What the step is for, one line */
  hint: string
  /** Accent (white text on it ≥ 4.5:1), a strong shade for hover, a soft tint for backgrounds */
  color: string
  strong: string
  soft: string
}

export const PHASES: PhaseInfo[] = [
  { id: 'skissa', n: 1, label: 'Skissa', hint: 'Lägg till virke och skivor, flytta, vrid, gruppera', color: '#2563eb', strong: '#1d4ed8', soft: '#e6eefe' },
  { id: 'detaljer', n: 2, label: 'Detaljer', hint: 'Ändar, fogar och skruv — och håller det?', color: '#7c3aed', strong: '#6d28d9', soft: '#f1eafe' },
  { id: 'handla', n: 3, label: 'Handla', hint: 'Kontroll, inköpslista och priser', color: '#be185d', strong: '#9d174d', soft: '#fce7f1' },
  { id: 'verkstad', n: 4, label: 'Verkstad', hint: 'Kapa och montera, steg för steg', color: '#0f766e', strong: '#115e59', soft: '#ddf3f0' },
]

export const phaseInfo = (id: Phase) => PHASES.find((p) => p.id === id) ?? PHASES[0]

/** Saved settings from earlier step names: Bygg/Redigera/Montering/Inköp */
const OLD: Record<string, Phase> = { bygg: 'skissa', redigera: 'detaljer', montering: 'verkstad', inkop: 'handla' }
export const toPhase = (mode: string | undefined): Phase =>
  PHASES.some((p) => p.id === mode) ? (mode as Phase) : (OLD[mode ?? ''] ?? 'skissa')
