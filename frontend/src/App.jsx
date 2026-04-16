import { useState, useCallback, useRef } from 'react'
import UploadCard from './components/UploadCard.jsx'
import PipelineFlow from './components/PipelineFlow.jsx'
import ResultsPanel from './components/ResultsPanel.jsx'

/*
  Phase machine:
  idle → orchestrating → embedding → agents → merging → approach → done
                   ↘ rejected
                   ↘ error
*/
const INITIAL = { phase: 'idle', data: null, error: null }

export default function App() {
  const [state, setState] = useState(INITIAL)
  const [activeTab, setActiveTab] = useState('analysis')
  const timersRef = useRef([])

  function clearTimers() {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  function later(fn, ms) {
    const t = setTimeout(fn, ms)
    timersRef.current.push(t)
  }

  const handleAnalyze = useCallback(async (formData) => {
    clearTimers()
    setState({ phase: 'orchestrating', data: null, error: null })
    setActiveTab('analysis') // Reset to default tab

    // Simulate intermediate phases while the HTTP call is in-flight
    later(() => setState(s => s.phase === 'orchestrating' ? { ...s, phase: 'embedding'     } : s), 3800)
    later(() => setState(s => s.phase === 'embedding'     ? { ...s, phase: 'agents'        } : s), 5200)

    try {
      const resp = await fetch('/api/analyze', { method: 'POST', body: formData })
      clearTimers()

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Server error' }))
        throw new Error(err.detail || `HTTP ${resp.status}`)
      }

      const data = await resp.json()

      if (!data.valid) {
        setState({ phase: 'rejected', data, error: null })
        return
      }

      // Animate the remaining pipeline stages after response arrives
      setState({ phase: 'agents', data, error: null })
      later(() => setState(s => ({ ...s, phase: 'merging'  })),  500)
      later(() => setState(s => ({ ...s, phase: 'approach' })), 1100)
      later(() => setState(s => ({ ...s, phase: 'done'     })), 1800)

    } catch (e) {
      clearTimers()
      setState({ phase: 'error', data: null, error: e.message })
    }
  }, [])

  function handleReset() {
    clearTimers()
    setState(INITIAL)
    setActiveTab('analysis')
  }

  const { phase, data, error } = state
  const isAnalyzing = !['idle', 'done', 'rejected', 'error'].includes(phase)
  const showPipeline = phase !== 'idle'
  const showResults  = phase === 'done' && data?.valid

  return (
    <div className="app">
      <header className="header">
        <div className="header-mark">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </div>
        <h1>Contract Analyzer Workspace</h1>
        <span className="header-sub">Enterprise Legal Evaluation</span>
      </header>

      <main className="main">
        <UploadCard
          onAnalyze={handleAnalyze}
          disabled={isAnalyzing}
          onReset={phase !== 'idle' ? handleReset : null}
        />

        {phase === 'error' && error && (
          <div className="error-banner" style={{ marginBottom: 20 }}>
            <span className="icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </span> Analysis failed: {error}
          </div>
        )}

        {phase === 'rejected' && data && (
          <div className="rejection-card">
            <div className="rejection-title">
              <span className="icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
              </span> Document rejected — not a legal contract
            </div>
            <div className="rejection-row">Detected type: <strong>{data.documentType}</strong></div>
            <div className="rejection-row">Reason: <strong>{data.reason}</strong></div>
            {data.missing && (
              <div className="rejection-row">Missing: <strong>{data.missing}</strong></div>
            )}
            <div className="rejection-row" style={{ marginTop: 10, color: 'var(--text-3)', fontSize: 13 }}>
              Data pipeline aborted. Please upload a valid legal contract to proceed.
            </div>
            <div className="accepted-pills">
              {['Service Agreement','NDA','Employment Contract','SaaS Agreement',
                'Lease Agreement','Partnership Deed','Vendor Contract','Licensing Agreement'].map(t => (
                <span className="accepted-pill" key={t}>{t}</span>
              ))}
            </div>
          </div>
        )}

        {(showPipeline || showResults) && phase !== 'rejected' && phase !== 'error' && (
          <div className="main-tabs-container">
            <div className="main-tabs">
              <button 
                className={`main-tab ${activeTab === 'analysis' ? 'active' : ''}`}
                onClick={() => setActiveTab('analysis')}
              >
                Analysis Output
              </button>
              <button 
                className={`main-tab ${activeTab === 'dev' ? 'active' : ''}`}
                onClick={() => setActiveTab('dev')}
              >
                Developer Console
              </button>
            </div>
            
            <div className="main-tab-content">
              {activeTab === 'analysis' && (
                <div className="analysis-view">
                  {isAnalyzing && (
                    <div className="processing-state">
                      <div className="spinner"></div>
                      <div className="processing-text">
                        <strong>Processing document</strong>
                        <p>Executing multi-agent evaluation... This may take a moment.</p>
                      </div>
                    </div>
                  )}
                  {showResults && <ResultsPanel data={data} />}
                </div>
              )}

              {activeTab === 'dev' && (
                <div className="dev-view">
                  <div className="dev-notice">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 18 22 12 16 6"></polyline>
                      <polyline points="8 6 2 12 8 18"></polyline>
                    </svg>
                    <span><strong>Data Pipeline Trace</strong> — Real-time logging of orchestration steps</span>
                  </div>
                  {showPipeline && <PipelineFlow state={state} />}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
