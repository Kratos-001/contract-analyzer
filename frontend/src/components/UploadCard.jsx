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
        <div className="drop-zone-icon">📄</div>
        <p><strong>Click to upload</strong> or drag &amp; drop</p>
        <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-3)' }}>PDF, TXT, DOCX · up to 10 MB</p>
      </div>

      {file && (
        <div className="file-pill">
          <span>📎</span>
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
