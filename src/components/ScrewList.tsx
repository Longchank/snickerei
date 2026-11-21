import { useMemo } from 'react'
import { Info } from './Info'
import { SCREW_COLORS, screwJoints, screwName, screwSections, screwTotals, type Joint, type ScrewTotal } from '../lib/screws'
import { buildSteps } from '../lib/steps'
import { useStore } from '../lib/store'

const mm = (v: number) => String(v).replace('.', ',')

function Dot({ color }: { color?: string }) {
  return <span className="screw-dot" style={{ background: color }} aria-hidden />
}

/** Screw sizes with how many, how many to buy and which pilot bit */
function TotalsTable({ totals, colorOf }: { totals: ScrewTotal[]; colorOf: Map<string, string> }) {
  return (
    <table className="screw-table">
      <thead>
        <tr>
          <th>Skruv</th>
          <th className="num">Behövs</th>
          <th className="num">Köp</th>
          <th>Förborra</th>
        </tr>
      </thead>
      <tbody>
        {totals.map((t) => (
          <tr key={screwName(t.screw)}>
            <td>
              <Dot color={colorOf.get(screwName(t.screw))} />
              {screwName(t.screw)}
            </td>
            <td className="num">{t.count}</td>
            <td className="num">{t.toBuy}</td>
            <td>{t.bits.length ? t.bits.map((b) => `Ø ${mm(b)} mm`).join(', ') : <span className="muted">–</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function JointList({ joints, colorOf }: { joints: Joint[]; colorOf: Map<string, string> }) {
  return (
    <ul className="joint-list">
      {joints.map((j) => (
        <li key={`${j.through.id}|${j.into.id}`}>
          <strong>
            {j.through.name} → {j.into.name}
          </strong>
          <span>
            <Dot color={colorOf.get(screwName(j.screw))} />
            {j.count} st {screwName(j.screw)}
            {j.endGrain ? ' · i ändträ' : ''}
          </span>
          {j.predrill && (
            <span className="predrill">
              Förborra Ø {mm(j.predrill.bit)} mm ({j.predrill.reason})
            </span>
          )}
          {j.short && <span className="warn small">Kortare än tumregeln — delen bakom är tunn. Överväg vinkeljärn.</span>}
          {j.blockedBy && (
            <span className="warn small">
              Åtkomst blockerad — {j.blockedBy} täcker sidan där skruven ska in. Snedskruva, skruva före {j.blockedBy} sätts
              dit, eller använd vinkeljärn.
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * Suggested screws: what to buy in total, then per build step — each group
 * on its own (a frame, a set of legs), then where groups are joined together.
 * Rules of thumb, shown as suggestions.
 */
export function ScrewList({ print = false, buyOnly = false }: { print?: boolean; buyOnly?: boolean }) {
  const parts = useStore((s) => s.project.parts)
  const groups = useStore((s) => s.project.groups)
  const joints = useMemo(() => screwJoints(parts), [parts])
  const totals = useMemo(() => screwTotals(joints), [joints])
  const sections = useMemo(() => screwSections(joints, groups), [joints, groups])
  const screwView = useStore((s) => s.screwView)
  const setScrewView = useStore((s) => s.setScrewView)
  const colorOf = new Map(totals.map((t, i) => [screwName(t.screw), SCREW_COLORS[i % SCREW_COLORS.length]]))
  // The build step chosen in the view (or here): only its screws
  const activeStep = useStore((s) => s.activeStep)
  const setActiveStep = useStore((s) => s.setActiveStep)
  const steps = useMemo(() => buildSteps(parts, groups), [parts, groups])
  const shownSections = print || !activeStep ? sections : sections.filter((sec) => sec.step === activeStep)
  if (!joints.length) return <p className="hint small">Inga delar ligger an mot varandra än — då behövs inga skruvar.</p>
  // Inköp: just what to buy; the joints and steps are under Montering
  if (buyOnly)
    return (
      <div className="screw-list">
        <TotalsTable totals={totals} colorOf={colorOf} />
        <p className="hint small">"Köp" har ca 10 % extra. Fog för fog och förborrning finns under 3 Montering.</p>
      </div>
    )
  return (
    <div className="screw-list">
      {!print && (
        <button className={`chip view-toggle ${screwView ? 'on' : ''}`} aria-pressed={screwView} onClick={() => setScrewView(!screwView)}>
          {screwView ? '✓ Skruv i 3D' : '● Skruv i 3D'}
        </button>
      )}
      <h4 className="screw-heading">Totalt att köpa</h4>
      <TotalsTable totals={totals} colorOf={colorOf} />
      {(() => {
        const text = (
          <>
            Färgen visar var skruven sitter i 3D{print ? '' : ' (markera en grupp för att bara se dess skruvar)'}. "Köp" har ca
            10 % extra; skruv säljs ofta i askar om 100–250 st. Förslag efter tumregler: skruven ska gå ca 1,5 gånger delens
            tjocklek in i delen bakom (mer i ändträ), minst 2 per fog. Förborra i den mottagande delen med borren i tabellen.
          </>
        )
        return print ? <p className="hint small">{text}</p> : <Info label="Om förslagen">{text}</Info>
      })()}
      <h4 className="screw-heading">Steg för steg</h4>
      {!print && (
        <div className="step-chips" role="group" aria-label="Visa steg">
          <button className={`chip ${!activeStep ? 'on' : ''}`} aria-pressed={!activeStep} onClick={() => setActiveStep(null)}>
            Alla
          </button>
          {steps.map((st, i) => (
            <button key={st.id} className={`chip ${activeStep === st.id ? 'on' : ''}`} aria-pressed={activeStep === st.id} onClick={() => setActiveStep(st.id)}>
              {i + 1}. {st.title}
            </button>
          ))}
        </div>
      )}
      {shownSections.length === 0 && <p className="hint small">Inga skruvfogar i det här steget.</p>}
      {shownSections.map((sec) => {
        const secTotals = screwTotals(sec.joints)
        const n = sec.joints.reduce((s, j) => s + j.count, 0)
        return (
          <details key={sec.title} className={`screw-section ${sec.kind}`} open={print || !!activeStep}>
            <summary>
              <span>{sec.title}</span>
              <span className="muted small">
                {n} skruv · {sec.joints.length} {sec.joints.length === 1 ? 'fog' : 'fogar'}
              </span>
            </summary>
            <TotalsTable totals={secTotals} colorOf={colorOf} />
            <JointList joints={sec.joints} colorOf={colorOf} />
          </details>
        )
      })}
    </div>
  )
}
