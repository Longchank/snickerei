import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Home } from './components/Home'
import { useStore } from './lib/store'
import './styles.css'

/** The start page, or the open project */
function Root() {
  const home = useStore((s) => s.home)
  return home ? <Home /> : <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
