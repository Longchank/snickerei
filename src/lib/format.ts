const kr = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 })

export const formatKr = (v: number) => kr.format(v)
export const formatM = (mm: number) => `${num.format(mm / 1000)} m`

/** Prices older than this are flagged in the UI */
export const STALE_DAYS = 14

/** Whole days between an ISO date and now (calendar days, local time). */
export function ageInDays(iso: string, now = new Date()): number {
  const d = new Date(iso)
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())
  return Math.max(0, Math.round((day(now) - day(d)) / 86400000))
}

/** "idag", "igår", "för 5 dagar sedan" */
export function formatAge(iso: string, now = new Date()): string {
  const days = ageInDays(iso, now)
  return days === 0 ? 'idag' : days === 1 ? 'igår' : `för ${days} dagar sedan`
}

/** "16 nov 2026" */
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
