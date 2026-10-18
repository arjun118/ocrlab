import { useEffect, useState } from 'react'
import { StudioView } from './components/StudioView'
import { BatchView } from './components/BatchView'
import { AboutView } from './components/AboutView'

export function App() {
  const [currentView, setCurrentView] = useState<'studio' | 'batch' | 'about'>('studio')
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [health, setHealth] = useState<string>('Connecting...')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setHealth(`${d.threads} CPU Cores • 1M ONNX`))
      .catch(() => setHealth('Backend Offline'))
  }, [])

  const notify = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev))
    }, 3500)
  }

  return (
    <>
      <header className="app-header">
        <div className="brand-title">
          <i className="nf nf-md-text_recognition"></i>
          OCR LAB
        </div>

        <nav className="main-nav">
          <button
            type="button"
            className={currentView === 'studio' ? 'active' : ''}
            onClick={() => setCurrentView('studio')}
          >
            <i className="nf nf-cod-terminal"></i> Studio
          </button>
          <button
            type="button"
            className={currentView === 'batch' ? 'active' : ''}
            onClick={() => setCurrentView('batch')}
          >
            <i className="nf nf-md-layers_triple"></i> Batch
          </button>
          <button
            type="button"
            className={currentView === 'about' ? 'active' : ''}
            onClick={() => setCurrentView('about')}
          >
            <i className="nf nf-md-information"></i> About
          </button>
        </nav>

        <div className="header-meta">
          <span className="status-badge">
            <span className="status-dot"></span>
            {health}
          </span>
        </div>
      </header>

      {currentView === 'studio' && <StudioView onNotify={notify} />}
      {currentView === 'batch' && <BatchView onNotify={notify} />}
      {currentView === 'about' && <AboutView />}

      {toastMsg && (
        <div className="status-toast">
          <i className="nf nf-fa-info_circle"></i> {toastMsg}
        </div>
      )}
    </>
  )
}

export default App
