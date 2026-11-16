import { useEffect, useState } from 'react'
import { Catalog } from './components/Catalog'
import { CutList } from './components/CutList'
import { Inspector } from './components/Inspector'
import { PriceList } from './components/PriceList'
import { Toolbar } from './components/Toolbar'
import { Viewport } from './components/Viewport'
import { useStore } from './lib/store'

type Tab = 'del' | 'lista' | 'priser'

export function App() {
  const [tab, setTab] = useState<Tab>('del')
  useKeyboardShortcuts()

  return (
    <div className="app">
      <Toolbar />
      <Catalog />
      <main className="viewport">
        <Viewport />
      </main>
      <aside className="panel right">
        <nav className="tabs">
          <button className={tab === 'del' ? 'active' : ''} onClick={() => setTab('del')}>
            Egenskaper
          </button>
          <button className={tab === 'lista' ? 'active' : ''} onClick={() => setTab('lista')}>
            Såglista
          </button>
          <button className={tab === 'priser' ? 'active' : ''} onClick={() => setTab('priser')}>
            Prislista
          </button>
        </nav>
        {tab === 'del' && <Inspector />}
        {tab === 'lista' && <CutList />}
        {tab === 'priser' && <PriceList />}
      </aside>
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
