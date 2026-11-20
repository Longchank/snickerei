/**
 * The four steps of a build (owner 2026-11-20). Each step is a way of working:
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
  { id: 'bygg', n: 1, label: 'Bygg', hint: 'Lägg till virke och skivor, flytta, vrid, gruppera', color: '#2563eb', strong: '#1d4ed8', soft: '#e6eefe' },
  { id: 'detaljer', n: 2, label: 'Detaljer', hint: 'Längder, ändar, urtag — och håller det?', color: '#7c3aed', strong: '#6d28d9', soft: '#f1eafe' },
  { id: 'montering', n: 3, label: 'Montering', hint: 'Steg för steg och skruv', color: '#0f766e', strong: '#115e59', soft: '#ddf3f0' },
  { id: 'inkop', n: 4, label: 'Inköp', hint: 'Såglista, inköpslista och priser', color: '#be185d', strong: '#9d174d', soft: '#fce7f1' },
]

export const phaseInfo = (id: Phase) => PHASES.find((p) => p.id === id) ?? PHASES[0]

/** Saved settings from before the steps had 'redigera' */
export const toPhase = (mode: string | undefined): Phase =>
  mode === 'redigera' ? 'detaljer' : PHASES.some((p) => p.id === mode) ? (mode as Phase) : 'bygg'
