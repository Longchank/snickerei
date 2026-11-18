import { useEffect, useRef, useState } from 'react'
import { Catalog } from './components/Catalog'
import { CutList } from './components/CutList'
import { Inspector } from './components/Inspector'
import { PriceList } from './components/PriceList'
import { PrintReport } from './components/PrintReport'
import { Toolbar } from './components/Toolbar'
import { fitView, snapshotRef, Viewport } from './components/Viewport'
import { loadSupplierPrices, useStore } from './lib/store'

type Tab = 'lagg' | 'del' | 'lista' | 'priser'

const TABS: { id: Tab; label: string; icon: string; desktop: boolean }[] = [
  { id: 'lagg', label: 'Lägg till', icon: '＋', desktop: false },
  { id: 'del', label: 'Del', icon: '✎', desktop: true },
  { id: 'lista', label: 'Listor', icon: '☰', desktop: true },
  { id: 'priser', label: 'Priser', icon: 'kr', desktop: true },
]

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
  useEffect(() => {
    loadSupplierPrices()
  }, [])

  // Selecting or adding a part shows its properties
  // (except while picking several parts, so the list stays open)
  const measureMode = useStore((s) => s.measureMode)
  const placing = useStore((s) => s.placeProfile !== null)
  // Placing boards: get the panel out of the way so the model can be tapped
  useEffect(() => {
    if (placing && mobile) setSheetOpen(false)
  }, [placing, mobile])
  // Switching mode: Bygg shows the model and its action bar, so the details
  // panel closes; Redigera opens the details of what's selected
  const mode = useStore((s) => s.settings.mode)
  const firstMode = useRef(true)
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false
      return
    }
    if (mode === 'bygg') {
      if (mobile) setSheetOpen(false)
      setTab('lagg')
    } else if (useStore.getState().selection.length) {
      setTab('del')
      setSheetOpen(true)
    }
  }, [mode, mobile])
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
    if (hasSelection && st.settings.mode === 'redigera' && !st.placeProfile && !st.moveMode) {
      setTab('del')
      setSheetOpen(true)
    }
    // Every pick counts, also of the part that's already selected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickCount])

  // 'Lägg till' lives in the left column on desktop
  const activeTab: Tab = !mobile && tab === 'lagg' ? 'del' : tab

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
      {activeTab === 'lagg' && <Catalog />}
      {activeTab === 'del' && <Inspector />}
      {activeTab === 'lista' && <CutList onPrint={print} />}
      {activeTab === 'priser' && <PriceList />}
    </>
  )

  return (
    <>
      <div
        className={`app ${mobile ? 'mobile' : 'desktop'}${immersive ? ' immersive' : ''}${
          mobile && sheetOpen && !immersive ? ' sheet-open' : ''
        }`}
      >
        {!immersive && <Toolbar onPrint={print} />}
        {!mobile && !immersive && (
          <aside className="panel left">
            <Catalog />
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
            <nav className="tabbar">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={sheetOpen && activeTab === t.id ? 'active' : ''}
                  onClick={() => {
                    if (sheetOpen && activeTab === t.id) setSheetOpen(false)
                    else {
                      setTab(t.id)
                      setSheetOpen(true)
                    }
                  }}
                >
                  <span className="tab-icon">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </nav>
          </section>
        ) : (
          <aside className="panel right">
            <nav className="tabs">
              {TABS.filter((t) => t.desktop).map((t) => (
                <button key={t.id} className={activeTab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                  {t.id === 'del' ? 'Egenskaper' : t.id === 'lista' ? 'Såglista' : 'Prislista'}
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
