import { useState, useCallback, useRef } from 'react'
import UploadCard from './components/UploadCard.jsx'
import PipelineFlow from './components/PipelineFlow.jsx'
import ResultsPanel from './components/ResultsPanel.jsx'

/*
  Phase machine:
  idle → validating → orchestrating → embedding → agents → merging → approach → done
                   ↘ rejected
                   ↘ error
*/
const INITIAL = { phase: 'idle', data: null, error: null }

export default function App() {
  const [state, setState] = useState(INITIAL)
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
    setState({ phase: 'validating', data: null, error: null })

    // Simulate intermediate phases while the HTTP call is in-flight
    later(() => setState(s => s.phase === 'validating'    ? { ...s, phase: 'orchestrating' } : s), 2200)
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
  }

  const { phase, data, error } = state
  const isAnalyzing = !['idle', 'done', 'rejected', 'error'].includes(phase)
  const showPipeline = phase !== 'idle'
  const showResults  = phase === 'done' && data?.valid

  return (
    <div className="app">
      <header className="header">
        <div className="header-mark">⚖</div>
        <h1>Contract Analyzer</h1>
        <span className="header-sub">Multi-agent · RAG + ChromaDB · GPT-4o</span>
      </header>

      <main className="main">
        <UploadCard
          onAnalyze={handleAnalyze}
          disabled={isAnalyzing}
          onReset={phase !== 'idle' ? handleReset : null}
        />

        {phase === 'error' && error && (
          <div className="error-banner" style={{ marginBottom: 20 }}>
            ⚠ Analysis failed: {error}
          </div>
        )}

        {phase === 'rejected' && data && (
          <div className="rejection-card">
            <div className="rejection-title">🚫 Document rejected — not a legal contract</div>
            <div className="rejection-row">Detected type: <strong>{data.documentType}</strong></div>
            <div className="rejection-row">Reason: <strong>{data.reason}</strong></div>
            {data.missing && (
              <div className="rejection-row">Missing: <strong>{data.missing}</strong></div>
            )}
            <div className="rejection-row" style={{ marginTop: 10, color: 'var(--text-3)', fontSize: 12 }}>
              Agents were <strong>not dispatched</strong>. Upload a valid legal contract.
            </div>
            <div className="accepted-pills">
              {['Service Agreement','NDA','Employment Contract','SaaS Agreement',
                'Lease Agreement','Partnership Deed','Vendor Contract','Licensing Agreement'].map(t => (
                <span className="accepted-pill" key={t}>{t}</span>
              ))}
            </div>
          </div>
        )}

        {showPipeline && <PipelineFlow state={state} />}
        {showResults  && <ResultsPanel data={data} />}
      </main>
    </div>
  )
}
