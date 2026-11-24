import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Catalog, PartList } from './components/Catalog'
import { StepList } from './components/StepList'
import { GroupParts } from './components/GroupParts'
import { ScrewEditor } from './components/ScrewEditor'
import { Checklist } from './components/Checklist'
import { CutList } from './components/CutList'
import { Inspector } from './components/Inspector'
import { Analysis } from './components/Analysis'
import { PriceList } from './components/PriceList'
import { PrintReport } from './components/PrintReport'
import { Toolbar } from './components/Toolbar'
import { fitView, snapshotRef, Viewport } from './components/Viewport'
import { phaseInfo } from './lib/phases'
import { useStore } from './lib/store'
import type { Phase } from './lib/types'

type Tab = 'lagg' | 'delar' | 'del' | 'analys' | 'steg' | 'skruv' | 'koll' | 'lista' | 'priser'

const TAB_INFO: Record<Tab, { label: string; icon: string; desktop: string }> = {
  lagg: { label: 'Lägg till', icon: '＋', desktop: 'Lägg till' },
  delar: { label: 'Delar', icon: '▤', desktop: 'Delar och grupper' },
  del: { label: 'Del', icon: '✎', desktop: 'Egenskaper' },
  analys: { label: 'Analys', icon: '◎', desktop: 'Analys' },
  steg: { label: 'Steg', icon: '🪜', desktop: 'Steg för steg' },
  skruv: { label: 'Skruv', icon: '🔩', desktop: 'Ändra skruv' },
  koll: { label: 'Kontroll', icon: '✓', desktop: 'Kontroll' },
  lista: { label: 'Listor', icon: '☰', desktop: 'Såg- och inköpslista' },
  priser: { label: 'Priser', icon: 'kr', desktop: 'Priser' },
}

/** The panels of each step of the build (phases.ts) */
const PHASE_TABS: Record<Phase, Tab[]> = {
  bygg: ['lagg', 'delar'],
  detaljer: ['del', 'analys'],
  montering: ['steg', 'skruv', 'delar'],
  inkop: ['koll', 'lista', 'priser'],
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)))

export function App() {
  const mobile = useMediaQuery('(max-width: 800px)')
  const [tab, setTab] = useState<Tab>('lagg')
  const [sheetOpen, setSheetOpen] = useState(true)
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  /** Menus hidden: only the 3D view */
  const [immersive, setImmersive] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setImmersive(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const hasSelection = useStore((s) => s.selection.length > 0)
  const pickCount = useStore((s) => s.pickCount)
  useKeyboardShortcuts()

  // Selecting or adding a part shows its properties
  // (except while picking several parts, so the list stays open)
  const measureMode = useStore((s) => s.measureMode)
  const placing = useStore((s) => s.placeProfile !== null)
  // Placing, moving or turning: get the panel out of the way so the model
  // (and the arrows or rings on it) can be tapped
  const moving = useStore((s) => s.moveMode)
  const turning = useStore((s) => s.rotateMode || s.mirrorMode)
  const framing = useStore((s) => s.frameSheet !== null)
  useEffect(() => {
    if ((placing || moving || turning || framing) && mobile) setSheetOpen(false)
  }, [placing, moving, turning, framing, mobile])
  // The view's tool menu and the phone panel share the right edge: one at a time
  const toolsOpen = useStore((s) => s.toolsOpen)
  useEffect(() => {
    if (toolsOpen && mobile) setSheetOpen(false)
  }, [toolsOpen, mobile])
  // One window at a time on the phone: opening the panel folds in the tool
  // menu and finishes the floating tool bars (move, turn, mirror, frame) —
  // their changes are already made, like pressing Klar. Placing stays armed,
  // since the panel is where you pick the next board.
  useEffect(() => {
    if (!sheetOpen || !mobile) return
    const st = useStore.getState()
    st.setToolsOpen(false)
    if (st.moveMode) st.setMoveMode(false)
    if (st.rotateMode) st.setRotateMode(false)
    if (st.mirrorMode) st.setMirrorMode(false)
    if (st.frameSheet) st.closeFrame()
    if (st.screwFocus) st.focusScrew(null)
    if (st.jointMode) st.setJointMode(false)
    if (st.scaleMode) st.setScaleMode(false)
  }, [sheetOpen, mobile])
  // Skala: taps go to the model, so the panel closes; leaving Detaljer ends it
  const scaleMode = useStore((s) => s.scaleMode)
  useEffect(() => {
    if (scaleMode && mobile) setSheetOpen(false)
  }, [scaleMode, mobile])
  // "Ny fog": taps go to the model, so the panel closes; leaving Montering ends it
  const jointMode = useStore((s) => s.jointMode)
  useEffect(() => {
    if (jointMode && mobile) setSheetOpen(false)
  }, [jointMode, mobile])
  const phaseNow = useStore((s) => s.settings.mode)
  useEffect(() => {
    if (phaseNow !== 'montering' && useStore.getState().jointMode) useStore.getState().setJointMode(false)
    if (phaseNow !== 'detaljer' && useStore.getState().scaleMode) useStore.getState().setScaleMode(false)
  }, [phaseNow])
  // A screw tapped in 3D: its bar is the window now
  const screwFocus = useStore((s) => s.screwFocus)
  useEffect(() => {
    if (screwFocus && mobile) setSheetOpen(false)
  }, [screwFocus, mobile])
  // Something asked for the panel to open or close (e.g. "Visa i 3D")
  const panelRequest = useStore((s) => s.panelRequest)
  useEffect(() => {
    if (!panelRequest) return
    if (panelRequest.tab) setTab(panelRequest.tab as Tab)
    if (mobile) setSheetOpen(panelRequest.open)
  }, [panelRequest, mobile])
  // A board was added from Lägg till: close the menu so it shows in the view
  const partCount = useStore((s) => s.project.parts.length)
  const lastCount = useRef(partCount)
  useEffect(() => {
    if (partCount > lastCount.current && mobile && tab === 'lagg') setSheetOpen(false)
    lastCount.current = partCount
  }, [partCount, mobile, tab])
  // Switching step: Bygg shows the model and its action bar, so the panel
  // closes; Detaljer opens the details of what's selected; Montering and
  // Inköp open their lists
  const mode = useStore((s) => s.settings.mode)
  const firstMode = useRef(true)
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false
      return
    }
    setTab(PHASE_TABS[mode][0])
    useStore.getState().focusScrew(null)
    if (mode === 'bygg') {
      if (mobile) setSheetOpen(false)
    } else if (mode === 'detaljer') {
      setSheetOpen(useStore.getState().selection.length > 0 || !mobile)
    } else setSheetOpen(true)
  }, [mode, mobile])
  // A "!" tapped in 3D: show that item in the checklist
  const checkFocus = useStore((s) => s.checkFocus)
  useEffect(() => {
    if (!checkFocus) return
    setTab('koll')
    setSheetOpen(true)
  }, [checkFocus])
  useEffect(() => {
    if (measureMode) {
      setTab('del')
      setSheetOpen(true)
    }
  }, [measureMode])
  useEffect(() => {
    const st = useStore.getState()
    // Not while picking several parts or placing boards: keep the view clear
    // In Bygg the action bar handles the selection; Redigera opens the details
    if (hasSelection && st.settings.mode === 'detaljer' && !st.placeProfile && !st.moveMode && !st.rotateMode) {
      setTab('del')
      setSheetOpen(true)
    } else if (mobile && hasSelection && (st.settings.mode === 'bygg' || (tabRef.current === 'delar' && st.settings.mode !== 'montering'))) {
      // One window at a time: picked from a list (or in Bygg, where the
      // action bar takes over) — the list closes so what was picked is in view
      setSheetOpen(false)
    }
    // Every pick counts, also of the part that's already selected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickCount])

  // Each step has its own panels. Measuring uses the Del slot in any step.
  // On desktop 'Lägg till' lives in the left column.
  const tabs = PHASE_TABS[mode].filter((t) => mobile || t !== 'lagg')
  let activeTab: Tab = tabs.includes(tab) ? tab : tabs[0]
  if (measureMode) activeTab = 'del'
  const phase = phaseInfo(mode)
  const tabRef = useRef(activeTab)
  tabRef.current = activeTab

  const print = async () => {
    // Clean view for the snapshot: nothing selected, no overlays, whole model in frame
    useStore.getState().clearSelection()
    setCapturing(true)
    fitView()
    await nextFrame()
    await nextFrame()
    await nextFrame()
    setSnapshot(snapshotRef.current?.() ?? null)
    setCapturing(false)
    await nextFrame()
    window.print()
  }

  const content = (
    <>
      {activeTab === 'lagg' && <Catalog parts={false} />}
      {activeTab === 'delar' && (mode === 'montering' ? <GroupParts /> : <PartList />)}
      {activeTab === 'steg' && <StepList />}
      {activeTab === 'skruv' && <ScrewEditor />}
      {activeTab === 'koll' && <Checklist />}
      {activeTab === 'del' && <Inspector />}
      {activeTab === 'analys' && <Analysis />}
      {activeTab === 'lista' && <CutList onPrint={print} />}
      {activeTab === 'priser' && <PriceList />}
    </>
  )

  return (
    <>
      <div
        data-phase={mode}
        style={{ '--accent': phase.color, '--accent-strong': phase.strong, '--accent-soft': phase.soft } as CSSProperties}
        className={`app ${mobile ? 'mobile' : 'desktop'}${immersive ? ' immersive' : ''}${
          mobile && sheetOpen && !immersive ? ' sheet-open' : ''
        }`}
      >
        {!immersive && <Toolbar onPrint={print} />}
        {!mobile && !immersive && (
          <aside className="panel left">
            <Catalog parts={false} />
          </aside>
        )}
        <main className="viewport">
          <Viewport capturing={capturing} immersive={immersive} onImmersive={setImmersive} />
        </main>
        {immersive ? null : mobile ? (
          <section className={`sheet ${sheetOpen ? 'open' : ''}`}>
            <SheetHandle open={sheetOpen} onChange={setSheetOpen} />
            {sheetOpen && (
              <div className="sheet-body" key={activeTab}>
                {content}
              </div>
            )}
            <nav className="tabbar" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
              {tabs.map((t) => (
                <button
                  key={t}
                  className={sheetOpen && activeTab === t ? 'active' : ''}
                  onClick={() => {
                    if (sheetOpen && activeTab === t) setSheetOpen(false)
                    else {
                      setTab(t)
                      setSheetOpen(true)
                    }
                  }}
                >
                  <span className="tab-icon">{TAB_INFO[t].icon}</span>
                  {TAB_INFO[t].label}
                </button>
              ))}
            </nav>
          </section>
        ) : (
          <aside className="panel right">
            <nav className="tabs">
              {tabs.map((t) => (
                <button key={t} className={activeTab === t ? 'active' : ''} onClick={() => setTab(t)}>
                  {TAB_INFO[t].desktop}
                </button>
              ))}
            </nav>
            {content}
          </aside>
        )}
      </div>
      <PrintReport snapshot={snapshot} />
    </>
  )
}

/** Grab bar on the bottom panel: tap to toggle, swipe down to hide, up to show. */
function SheetHandle({ open, onChange }: { open: boolean; onChange: (open: boolean) => void }) {
  const start = useRef<number | null>(null)
  return (
    <div
      className="sheet-handle"
      role="button"
      tabIndex={0}
      aria-label={open ? 'Dölj panelen' : 'Visa panelen'}
      aria-expanded={open}
      onPointerDown={(e) => {
        start.current = e.clientY
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerUp={(e) => {
        if (start.current === null) return
        const dy = e.clientY - start.current
        start.current = null
        if (dy > 30) onChange(false)
        else if (dy < -30) onChange(true)
        else if (Math.abs(dy) < 10) onChange(!open)
      }}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onChange(!open)}
    >
      <span />
    </div>
  )
}

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, select, textarea')) return
      const s = useStore.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault()
        s.undo()
      } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault()
        s.redo()
      } else if (e.key === 'Escape') {
        s.clearSelection()
      } else if (s.selection.length) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          s.removeSelection()
        } else if (mod && key === 'd') {
          e.preventDefault()
          s.duplicateSelection()
        } else if (mod && key === 'g') {
          e.preventDefault()
          s.groupSelection('Grupp')
        } else if (!mod && key === 'r') {
          s.rotateSelection(1)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
