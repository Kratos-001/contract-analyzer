import { useState, useRef } from 'react'

export default function UploadCard({ onAnalyze, disabled, onReset }) {
  const [file, setFile]         = useState(null)
  const [text, setText]         = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [error, setError]       = useState('')
  const [loadingSample, setLoadingSample] = useState(false)
  const fileInputRef = useRef(null)

  function setSelectedFile(f) {
    setFile(f)
    setText('')
    setError('')
  }

  function clearFile() {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function loadSample() {
    setLoadingSample(true)
    try {
      const r = await fetch('/api/sample')
      const d = await r.json()
      setText(d.text)
      clearFile()
    } catch {
      setError('Could not load sample contract.')
    } finally {
      setLoadingSample(false)
    }
  }

  async function handleAnalyze() {
    setError('')
    if (!file && !text.trim()) {
      setError('Please upload a file or paste contract text.')
      return
    }
    const fd = new FormData()
    if (file) fd.append('contract', file)
    else      fd.append('text', text.trim())
    onAnalyze(fd)
  }

  const isAnalyzing = disabled

  return (
    <div className="card upload-card">
      <h2>Contract input</h2>

      {/* Drop zone */}
      <div
        className={`drop-zone${dragOver ? ' drag-over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) setSelectedFile(e.dataTransfer.files[0]) }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.docx"
          onChange={e => { if (e.target.files[0]) setSelectedFile(e.target.files[0]) }}
          disabled={isAnalyzing}
        />
        <div className="drop-zone-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </div>
        <p><strong>Click to upload</strong> or drag &amp; drop</p>
        <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-3)' }}>PDF, TXT, DOCX · up to 10 MB</p>
      </div>

      {file && (
        <div className="file-pill">
          <span className="file-pill-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
            </svg>
          </span>
          <span className="file-pill-name">{file.name}</span>
          <span className="file-pill-size">{(file.size / 1024).toFixed(1)} KB</span>
          <button className="file-pill-remove" onClick={clearFile} disabled={isAnalyzing}>✕</button>
        </div>
      )}

      <div className="divider">or paste text directly</div>

      <textarea
        placeholder="Paste your contract text here…"
        value={text}
        onChange={e => { setText(e.target.value); setFile(null) }}
        disabled={isAnalyzing}
      />

      <div className="btn-row">
        {!isAnalyzing ? (
          <>
            <button className="btn btn-primary" onClick={handleAnalyze}>
              Analyze contract →
            </button>
            <button className="btn btn-ghost" onClick={loadSample} disabled={loadingSample}>
              {loadingSample ? 'Loading…' : 'Load sample'}
            </button>
            {onReset && (
              <button className="btn btn-danger-ghost" onClick={() => { clearFile(); setText(''); setError(''); onReset() }}>
                Reset
              </button>
            )}
          </>
        ) : (
          <button className="btn btn-ghost" disabled>Analyzing…</button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}
    </div>
  )
}
