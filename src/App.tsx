import { useEffect, useState } from 'react'
import { Catalog } from './components/Catalog'
import { CutList } from './components/CutList'
import { Inspector } from './components/Inspector'
import { PriceList } from './components/PriceList'
import { PrintReport } from './components/PrintReport'
import { Toolbar } from './components/Toolbar'
import { canvasRef, fitView, Viewport } from './components/Viewport'
import { useStore } from './lib/store'

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
  const selectedId = useStore((s) => s.selectedId)
  useKeyboardShortcuts()

  // Selecting or adding a part shows its properties
  useEffect(() => {
    if (selectedId) {
      setTab('del')
      setSheetOpen(true)
    }
  }, [selectedId])

  // 'Lägg till' lives in the left column on desktop
  const activeTab: Tab = !mobile && tab === 'lagg' ? 'del' : tab

  const print = async () => {
    // Clean view for the snapshot: nothing selected, no overlays, whole model in frame
    useStore.getState().select(null)
    setCapturing(true)
    fitView()
    await nextFrame()
    await nextFrame()
    await nextFrame()
    setSnapshot(canvasRef.current?.toDataURL('image/png') ?? null)
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
      <div className={`app ${mobile ? 'mobile' : 'desktop'}`}>
        <Toolbar onPrint={print} />
        {!mobile && (
          <aside className="panel left">
            <Catalog />
          </aside>
        )}
        <main className="viewport">
          <Viewport capturing={capturing} />
        </main>
        {mobile ? (
          <section className={`sheet ${sheetOpen ? 'open' : ''}`}>
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
        s.select(null)
      } else if (s.selectedId) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          s.removePart(s.selectedId)
        } else if (mod && key === 'd') {
          e.preventDefault()
          s.duplicatePart(s.selectedId)
        } else if (!mod && key === 'r') {
          s.rotate(s.selectedId, 1)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
