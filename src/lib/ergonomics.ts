/**
 * "Soft values": common guideline dimensions for furniture, to answer
 * questions like "is this high enough for a dining table?". Typical Nordic
 * furniture practice, from general knowledge — shown as riktvärden
 * (guidelines), not requirements.
 */

/** What kind of distance a measurement is. */
export type MeasureKind =
  /** Height of a surface above the floor */
  | 'height'
  /** Vertical free space between two surfaces */
  | 'vgap'
  /** Horizontal distance (length, depth, width) */
  | 'horizontal'

export interface Guide {
  label: string
  kind: MeasureKind
  min: number
  max: number
  /** Short advice shown with the match */
  note?: string
}

export const GUIDES: Guide[] = [
  // Heights above the floor (top surface)
  { kind: 'height', label: 'Sitthöjd stol/bänk', min: 420, max: 480 },
  { kind: 'height', label: 'Sitthöjd soffa', min: 380, max: 450 },
  { kind: 'height', label: 'Barstol', min: 650, max: 800 },
  { kind: 'height', label: 'Soffbord', min: 400, max: 500 },
  { kind: 'height', label: 'Matbord', min: 720, max: 760 },
  { kind: 'height', label: 'Skrivbord', min: 700, max: 760 },
  { kind: 'height', label: 'Köksbänk', min: 880, max: 920 },
  { kind: 'height', label: 'Arbetsbänk', min: 850, max: 950, note: 'Ungefär 10–15 cm under armbågen' },
  { kind: 'height', label: 'Barbord', min: 1000, max: 1100 },
  { kind: 'height', label: 'Säng (liggyta)', min: 450, max: 600 },
  { kind: 'height', label: 'Nattduksbord', min: 500, max: 650 },
  { kind: 'height', label: 'Hylla som nås utan pall', min: 0, max: 1900 },

  // Vertical free space
  { kind: 'vgap', label: 'Benutrymme under bord', min: 650, max: 2000, note: 'Minst ca 65 cm fritt under skivan' },
  { kind: 'vgap', label: 'Från sits till bordsskiva', min: 270, max: 320 },
  { kind: 'vgap', label: 'Hylla för pocketböcker', min: 200, max: 250 },
  { kind: 'vgap', label: 'Hylla för vanliga böcker', min: 250, max: 320 },
  { kind: 'vgap', label: 'Hylla för pärmar (A4)', min: 320, max: 360 },
  { kind: 'vgap', label: 'Hylla för vinylskivor', min: 330, max: 380 },

  // Horizontal
  { kind: 'horizontal', label: 'Sittdjup', min: 400, max: 500 },
  { kind: 'horizontal', label: 'Djup matbord (en sida)', min: 400, max: 500 },
  { kind: 'horizontal', label: 'Bredd matbord (båda sidor)', min: 800, max: 1000 },
  { kind: 'horizontal', label: 'Djup skrivbord', min: 600, max: 800 },
  { kind: 'horizontal', label: 'Djup köksbänk', min: 600, max: 650 },
  { kind: 'horizontal', label: 'Djup bokhylla', min: 250, max: 350 },
  { kind: 'horizontal', label: 'Djup arbetsbänk', min: 600, max: 800 },
]

/** Seat or table length per person */
export const PER_PERSON = 600

export interface GuideMatch {
  guide: Guide
  /** inside the range, or close to it (within 5 %) */
  fit: 'ok' | 'near'
}

/** Guidelines this value matches or nearly matches, best first. */
export function matchGuides(value: number, kind: MeasureKind): GuideMatch[] {
  const out: GuideMatch[] = []
  for (const guide of GUIDES) {
    if (guide.kind !== kind) continue
    if (value >= guide.min && value <= guide.max) out.push({ guide, fit: 'ok' })
    else {
      const slack = Math.max(15, ((guide.min + guide.max) / 2) * 0.05)
      if (value >= guide.min - slack && value <= guide.max + slack) out.push({ guide, fit: 'near' })
    }
  }
  // Narrow ranges are more telling than wide ones ("Hylla som nås" fits almost anything)
  return out.sort((a, b) => (a.fit === b.fit ? a.guide.max - a.guide.min - (b.guide.max - b.guide.min) : a.fit === 'ok' ? -1 : 1))
}

/** "Plats för 3 personer" for a seat or table length. */
export function seatsFor(length: number): number {
  return Math.floor(length / PER_PERSON)
}

/** How far a value is from a guide: negative = too low/short, 0 = inside. */
export function offBy(value: number, guide: Guide): number {
  return value < guide.min ? value - guide.min : value > guide.max ? value - guide.max : 0
}

/** "plats för 1 person" / "plats för 3 personer" */
export function seatsText(length: number): string {
  const n = seatsFor(length)
  return n === 1 ? 'plats för 1 person' : `plats för ${n} personer`
}
