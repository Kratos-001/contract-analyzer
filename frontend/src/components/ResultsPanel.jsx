import { useState } from 'react'
import { parseApproach, parseRisks, parseRewrites, parseClauses } from '../utils/parse.js'

/* ── Verdict chip ───────────────────────────────────────────────── */
const VERDICT_COLOR = {
  'DO NOT SIGN':       'red',
  'NEGOTIATE FIRST':   'amber',
  'SIGN WITH CAUTION': 'amber',
  'SAFE TO SIGN':      'green',
}
const IconCheck = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
const IconAlert = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
const IconX = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>

const VERDICT_ICON = { red: IconX, amber: IconAlert, green: IconCheck }

/* ── Approach tab ───────────────────────────────────────────────── */
function ApproachTab({ text }) {
  const a = parseApproach(text)
  const color = VERDICT_COLOR[a.verdict] || 'amber'

  return (
    <div>
      <div className="verdict-row">
        <div className={`verdict-chip ${color}`}>
          {VERDICT_ICON[color]} {a.verdict || '—'}
        </div>
      </div>

      <div className="info-block">
        <div className="info-block-label">Why this verdict</div>
        <p>{a.reasoning || '—'}</p>
      </div>

      <div className="info-block">
        <div className="info-block-label">Recommended action plan</div>
        {[a.step1, a.step2, a.step3].map((s, i) => (
          <div className="action-step" key={i}>
            <div className="action-num">{i + 1}</div>
            <div className="action-text">{s || '—'}</div>
          </div>
        ))}
      </div>

      <div className="info-block" style={{ borderColor: 'var(--red-border)', background: 'var(--red-light)' }}>
        <div className="info-block-label" style={{ color: 'var(--red)' }}>CRITICAL PRIORITY — Fix this clause first</div>
        <p>{a.priorityClause || '—'}</p>
      </div>
    </div>
  )
}

/* ── Risks tab ──────────────────────────────────────────────────── */
function RisksTab({ text }) {
  const risks = parseRisks(text)
  if (!risks.length) return <div className="empty-state">No risk flags found.</div>

  return (
    <div className="risk-list">
      {risks.map((r, i) => (
        <div className={`risk-item ${r.severity}`} key={i}>
          <div className="risk-sev">{r.severity}</div>
          <div className="risk-clause">{r.clause}</div>
          <div className="risk-text">{r.risk}</div>
          <div className="risk-impact">Impact: {r.impact}</div>
        </div>
      ))}
    </div>
  )
}

/* ── Rewrites tab ───────────────────────────────────────────────── */
function RewritesTab({ text }) {
  const rewrites = parseRewrites(text)
  if (!rewrites.length) return <div className="empty-state">No rewrites found.</div>

  return (
    <div className="rewrite-list">
      {rewrites.map((r, i) => (
        <div className="rewrite-item" key={i}>
          <div className="rewrite-header">
            <div className="rewrite-name">{r.clause}</div>
            <div className="rewrite-problem">{r.problem}</div>
          </div>
          <div className="rewrite-body">
            <div className="label-red">Original (problematic)</div>
            <div className="original-quote">"{r.original}"</div>
            <div className="label-teal">Suggested rewrite</div>
            <div className="rewrite-text">{r.rewrite}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Clauses tab ────────────────────────────────────────────────── */
function ClausesTab({ text }) {
  const clauses = parseClauses(text)
  if (!clauses.length) return <div className="empty-state">No clauses found.</div>

  return (
    <div className="clause-list">
      {clauses.map((c, i) => (
        <div className="clause-item" key={i}>
          <div className="clause-top">
            <span className="clause-name">{c.clause}</span>
            {c.type && <span className="clause-type">{c.type}</span>}
          </div>
          <div className="clause-grid">
            <div>
              <div className="clause-party-lbl">Party A obligations</div>
              <div className="clause-party-val">{c.partyA || '—'}</div>
            </div>
            <div>
              <div className="clause-party-lbl">Party B obligations</div>
              <div className="clause-party-val">{c.partyB || '—'}</div>
            </div>
          </div>
          {c.keyTerms && c.keyTerms !== 'NONE' && (
            <div className="key-terms">
              <div className="key-terms-lbl">Key terms</div>
              {c.keyTerms}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ── Main results panel ─────────────────────────────────────────── */
const TABS = [
  { id: 'approach', label: 'Best approach' },
  { id: 'risks',    label: 'Risk flags' },
  { id: 'rewrites', label: 'Rewrites' },
  { id: 'clauses',  label: 'Clause map' },
]

export default function ResultsPanel({ data }) {
  const [activeTab, setActiveTab] = useState('approach')

  const high = data.meta?.highRiskCount   ?? 0
  const med  = data.meta?.mediumRiskCount ?? 0

  const circleClass = high >= 3 ? 'high' : high >= 1 ? 'medium' : 'low'
  const circleNum   = high >= 1 ? high : med
  const circleLbl   = high >= 3 ? 'HIGH' : high >= 1 ? 'MED' : 'LOW'

  const scoreTitle = high >= 3
    ? 'High risk contract — do not sign as-is'
    : high >= 1
    ? 'Moderate risk — negotiate before signing'
    : 'Lower risk — review remaining medium issues'

  const scoreSub = `${high} high-severity · ${med} medium-severity issue${med !== 1 ? 's' : ''} across all chunks`

  return (
    <div className="results-panel">
      {/* Score bar */}
      <div className="score-bar">
        <div className={`risk-badge ${circleClass}`}>
          <span className="risk-badge-num">{circleNum}</span>
          <span className="risk-badge-lbl">{circleLbl}</span>
        </div>
        <div className="score-text">
          <strong>{scoreTitle}</strong>
          <span>{scoreSub}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-card">
        <div className="tabs-header">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`tab-btn${activeTab === t.id ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="tab-body">
          <div className={`tab-panel${activeTab === 'approach' ? ' active' : ''}`}>
            <ApproachTab text={data.approach} />
          </div>
          <div className={`tab-panel${activeTab === 'risks' ? ' active' : ''}`}>
            <RisksTab text={data.agents?.risk ?? ''} />
          </div>
          <div className={`tab-panel${activeTab === 'rewrites' ? ' active' : ''}`}>
            <RewritesTab text={data.agents?.negotiation ?? ''} />
          </div>
          <div className={`tab-panel${activeTab === 'clauses' ? ' active' : ''}`}>
            <ClausesTab text={data.agents?.extractor ?? ''} />
          </div>
        </div>
      </div>
    </div>
  )
}
