import { useState } from 'react'
import { parseApproach } from '../utils/parse.js'

/* ── Phase ordering ─────────────────────────────────────────────── */
const ORDER = ['idle','orchestrating','embedding','agents','merging','approach','done']

function phaseIdx(p) {
  if (p === 'rejected' || p === 'error') return ORDER.indexOf('orchestrating')
  return ORDER.indexOf(p)
}

function nodeStatus(nodePhase, currentPhase) {
  if (currentPhase === 'idle') return 'idle'
  if (currentPhase === 'error')    return nodePhase === 'orchestrating' ? 'error'    : 'idle'
  if (currentPhase === 'rejected') return nodePhase === 'orchestrating' ? 'rejected' : 'idle'
  const ci = phaseIdx(currentPhase)
  const ni = ORDER.indexOf(nodePhase)
  if (ci < ni) return 'idle'
  if (ci === ni) return 'active'
  return 'done'
}

function arrowStatus(targetPhase, currentPhase) {
  if (['idle','rejected','error'].includes(currentPhase)) return 'idle'
  const ci = phaseIdx(currentPhase)
  const ti = ORDER.indexOf(targetPhase)
  if (ci < ti) return 'idle'
  if (ci === ti) return 'active'
  return 'done'
}

/* ── SVG animated vertical connector ───────────────────────────── */
function Connector({ status, height = 40 }) {
  const color  = status === 'done' ? 'var(--green)' : status === 'active' ? 'var(--blue)' : 'var(--border)'
  const dashed = status === 'active'
  const cx     = 10
  return (
    <div className="connector">
      <svg width={cx * 2} height={height} style={{ overflow: 'visible' }}>
        <line x1={cx} y1={0} x2={cx} y2={height - 8}
          stroke={color} strokeWidth="2"
          strokeDasharray={dashed ? '4 3' : 'none'}
          className={dashed ? 'flow-active' : ''} />
        <path d={`M ${cx-4} ${height-10} L ${cx} ${height-3} L ${cx+4} ${height-10}`}
          fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/* ── Fork: 1 line → 3 drops ─────────────────────────────────────── */
function ForkConnector({ status }) {
  const color  = status === 'done' ? 'var(--green)' : status === 'active' ? 'var(--blue)' : 'var(--border)'
  const dashed = status === 'active'
  const cls    = dashed ? 'flow-active' : ''
  const W = 320, H = 48, cx = W / 2, lx = 53, rx = W - 53
  return (
    <div className="fork-connector" style={{ width: '100%', maxWidth: W }}>
      <svg width={W} height={H}>
        <line x1={cx} y1={0}     x2={cx} y2={H/2} stroke={color} strokeWidth="2" strokeDasharray={dashed ? '4 3' : 'none'} className={cls} />
        <line x1={lx} y1={H/2}  x2={rx} y2={H/2} stroke={color} strokeWidth="2" />
        <line x1={lx} y1={H/2}  x2={lx} y2={H}   stroke={color} strokeWidth="2" strokeDasharray={dashed ? '4 3' : 'none'} className={cls} />
        <line x1={cx} y1={H/2}  x2={cx} y2={H}   stroke={color} strokeWidth="2" strokeDasharray={dashed ? '4 3' : 'none'} className={cls} />
        <line x1={rx} y1={H/2}  x2={rx} y2={H}   stroke={color} strokeWidth="2" strokeDasharray={dashed ? '4 3' : 'none'} className={cls} />
      </svg>
    </div>
  )
}

/* ── Join: 3 rises → 1 stem ─────────────────────────────────────── */
function JoinConnector({ status }) {
  const color  = status === 'done' ? 'var(--green)' : status === 'active' ? 'var(--blue)' : 'var(--border)'
  const dashed = status === 'active'
  const cls    = dashed ? 'flow-active' : ''
  const W = 320, H = 48, cx = W / 2, lx = 53, rx = W - 53
  return (
    <div className="join-connector" style={{ width: '100%', maxWidth: W }}>
      <svg width={W} height={H}>
        <line x1={lx} y1={0}    x2={lx} y2={H/2} stroke={color} strokeWidth="2" strokeDasharray={dashed ? '4 3' : 'none'} className={cls} />
        <line x1={cx} y1={0}    x2={cx} y2={H/2} stroke={color} strokeWidth="2" strokeDasharray={dashed ? '4 3' : 'none'} className={cls} />
        <line x1={rx} y1={0}    x2={rx} y2={H/2} stroke={color} strokeWidth="2" strokeDasharray={dashed ? '4 3' : 'none'} className={cls} />
        <line x1={lx} y1={H/2} x2={rx} y2={H/2} stroke={color} strokeWidth="2" />
        <line x1={cx} y1={H/2} x2={cx} y2={H-8} stroke={color} strokeWidth="2" strokeDasharray={dashed ? '4 3' : 'none'} className={cls} />
        <path d={`M ${cx-4} ${H-10} L ${cx} ${H-3} L ${cx+4} ${H-10}`} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/* ── Status icon ────────────────────────────────────────────────── */
function StatusIcon({ status }) {
  if (status === 'done')                       return <span style={{ color:'var(--green)', fontSize:14 }}>✓</span>
  if (status === 'error' || status === 'rejected') return <span style={{ color:'var(--red)',   fontSize:14 }}>✕</span>
  return null
}

/* ── Single pipeline node ───────────────────────────────────────── */
function PipelineNode({ icon, title, sub, badge, badgeClass, status, output }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = output && output.length > 400

  return (
    <div className={`p-node ${status}`} style={{ width:'100%', maxWidth:560 }}>
      <div className="p-node-header">
        <div className="p-node-dot" />
        <span style={{ fontSize:13, fontWeight:700, color:'var(--text-3)' }}>{icon}</span>
        <span className="p-node-title">{title}</span>
        {badge && <span className={`p-node-badge ${badgeClass}`}>{badge}</span>}
        <StatusIcon status={status} />
      </div>
      {sub && <div className="p-node-sub">{sub}</div>}
      {output && status !== 'idle' && (
        <>
          <div className={`p-node-output${expanded ? ' expanded' : ''}`}>
            {expanded ? output : output.slice(0, 400)}
          </div>
          {isLong && (
            <button className="p-node-expand" onClick={() => setExpanded(x => !x)}>
              {expanded ? '↑ Collapse' : '↓ Show full output'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

/* ── ChromaDB / RAG node ────────────────────────────────────────── */
function VectorStoreNode({ status, ragInfo, chunkCount }) {
  const [expanded, setExpanded] = useState(false)

  const details = ragInfo ? [
    `Embedding model: ${ragInfo.embeddingModel}`,
    `Vector store: ${ragInfo.vectorStore}`,
    `Chunks embedded: ${ragInfo.totalChunks}`,
    `Top-k per agent: ${ragInfo.topK}`,
    `Extractor retrieved: ${ragInfo.retrievedChunks?.extractor ?? '?'}/${ragInfo.totalChunks} chunks`,
    `Risk retrieved:      ${ragInfo.retrievedChunks?.risk ?? '?'}/${ragInfo.totalChunks} chunks`,
    `Negotiation retrieved: ${ragInfo.retrievedChunks?.negotiation ?? '?'}/${ragInfo.totalChunks} chunks`,
  ].join('\n') : null

  const sub = ragInfo
    ? `${ragInfo.totalChunks} chunk(s) embedded · top-${ragInfo.topK} retrieved per agent via cosine similarity`
    : status === 'active'
    ? `Embedding ${chunkCount ?? '?'} chunk(s) with text-embedding-3-small…`
    : null

  return (
    <div className={`p-node ${status}`} style={{ width:'100%', maxWidth:560, borderStyle: status === 'idle' ? 'dashed' : 'solid' }}>
      <div className="p-node-header">
        <div className="p-node-dot" />
        <span style={{ fontSize:13, fontWeight:700, color:'var(--text-3)' }}>02</span>
        <span className="p-node-title">ChromaDB Vector Store</span>
        <span className={`p-node-badge badge-blue`}>RAG · text-embedding-3-small</span>
        <StatusIcon status={status} />
      </div>
      {sub && <div className="p-node-sub">{sub}</div>}
      {details && status !== 'idle' && (
        <>
          <div className={`p-node-output${expanded ? ' expanded' : ''}`} style={{ fontFamily:'SF Mono, Fira Code, monospace', fontSize:11 }}>
            {details}
          </div>
          <button className="p-node-expand" onClick={() => setExpanded(x => !x)}>
            {expanded ? '↑ Collapse' : '↓ Show retrieval details'}
          </button>
        </>
      )}
    </div>
  )
}

/* ── Agent node ─────────────────────────────────────────────────── */
function AgentNode({ icon, title, badge, badgeClass, desc, status, output, retrieved, total }) {
  const [expanded, setExpanded] = useState(false)

  const ragLabel = (status === 'active' || status === 'done') && retrieved != null
    ? `RAG: ${retrieved}/${total} chunk${retrieved !== 1 ? 's' : ''} retrieved`
    : null

  return (
    <div className={`agent-node ${status}`}>
      <div className="agent-node-header">
        <div className="agent-node-dot" />
        <span style={{ fontSize:11, fontWeight:700, color:'var(--text-3)' }}>{icon}</span>
        <span className="agent-node-title">{title}</span>
        {status === 'done' && <span style={{ color:'var(--green)', fontSize:12, marginLeft:'auto' }}>✓</span>}
      </div>
      {badge && <div style={{ marginBottom:6 }}><span className={`p-node-badge ${badgeClass}`}>{badge}</span></div>}
      {ragLabel && (
        <div style={{ fontSize:11, color:'var(--blue)', fontWeight:600, marginBottom:6, display:'flex', alignItems:'center', gap:4 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>{ragLabel}
        </div>
      )}
      <div className="agent-node-desc">{desc}</div>
      {output && status !== 'idle' && (
        <>
          <div className="agent-node-output" style={{ maxHeight: expanded ? 200 : 80 }}>
            {output}
          </div>
          {output.length > 160 && (
            <button onClick={() => setExpanded(x => !x)}
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:11,
                       color:'var(--blue)', marginTop:4, fontFamily:'inherit', padding:0 }}>
              {expanded ? 'Collapse ↑' : 'Expand ↓'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

/* ── Main pipeline ──────────────────────────────────────────────── */
export default function PipelineFlow({ state }) {
  const { phase, data } = state

  const orchestratorStatus = nodeStatus('orchestrating', phase)
  const embeddingStatus    = nodeStatus('embedding',     phase)
  const agentsStatus       = nodeStatus('agents',        phase)
  const mergerStatus       = nodeStatus('merging',       phase)
  const approachStatus     = nodeStatus('approach',      phase)

  const arrow2 = arrowStatus('embedding',     phase)  // orchestrator → chroma
  const arrow3 = arrowStatus('agents',        phase)  // chroma → agents (fork)
  const arrow4 = arrowStatus('merging',       phase)  // agents → merger (join)
  const arrow5 = arrowStatus('approach',      phase)  // merger → approach

  const ragInfo    = data?.ragInfo
  const chunkCount = data?.chunkCount

  // Approach output
  let approachOut = null
  if (data?.approach) {
    const a = parseApproach(data.approach)
    approachOut = a.verdict ? `Verdict: ${a.verdict}\n\n${a.reasoning}` : data.approach.slice(0, 300)
  }

  // Orchestrator output
  const orchestratorOut = data
    ? data.valid
      ? `✓ Valid legal contract\nType: ${data.documentType}\n\n${data.orchestratorPlan}`
      : `✗ Not a legal contract\nType: ${data.documentType}\nReason: ${data.reason}`
    : null

  // Merger output
  const mergerOut = data?.agents
    ? [
        `Extractor: ${data.agents.extractor.split('---').filter(b => b.trim()).length} unique clause(s)`,
        `Risk: ${data.agents.risk.split('---').filter(b => b.trim()).length} unique issue(s)`,
        `Negotiation: ${data.agents.negotiation.split('---').filter(b => b.trim()).length} unique rewrite(s)`,
        `Deduplication: cross-chunk duplicates removed by clause name + severity key`,
      ].join('\n')
    : null

  return (
    <div className="pipeline-wrap card" style={{ padding:'24px' }}>
      <h2>Analysis pipeline</h2>

      <div className="pipeline">

        {/* STEP 1 — Orchestrator Gate */}
        <PipelineNode
          icon="01" title="Orchestrator Gate"
          sub={chunkCount
            ? `${chunkCount} chunk(s) · top-${ragInfo?.topK ?? '?'} RAG retrieval per agent`
            : phase === 'orchestrating' ? 'Validating document and planning agent dispatch…' : null}
          badge="Step 1 · Sequential" badgeClass="badge-slate"
          status={orchestratorStatus} output={orchestratorOut}
        />

        <Connector status={arrow2} />

        {/* STEP 3 — ChromaDB Vector Store */}
        <VectorStoreNode
          status={embeddingStatus}
          ragInfo={ragInfo}
          chunkCount={chunkCount}
        />

        {/* Fork connector: ChromaDB → 3 agents */}
        <ForkConnector status={arrow3} />

        {/* STEP 3 — Parallel agents */}
        <div style={{ width:'100%', maxWidth:560 }}>
          <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px',
                        color:'var(--text-3)', marginBottom:10, textAlign:'center' }}>
            Step 3 · All 3 agents run in parallel on RAG-retrieved chunks
          </div>
          <div className="agents-cluster">
            <AgentNode
              icon="A" title="Clause Extractor"
              badge="structured reader" badgeClass="badge-blue"
              desc="Reads relevant clauses neutrally. Facts only."
              status={agentsStatus}
              output={data?.agents?.extractor}
              retrieved={ragInfo?.retrievedChunks?.extractor}
              total={ragInfo?.totalChunks}
            />
            <AgentNode
              icon="B" title="Risk Analyzer"
              badge="defense lawyer" badgeClass="badge-red"
              desc="Finds dangerous clauses. Rates HIGH / MED / LOW."
              status={agentsStatus}
              output={data?.agents?.risk}
              retrieved={ragInfo?.retrievedChunks?.risk}
              total={ragInfo?.totalChunks}
            />
            <AgentNode
              icon="C" title="Negotiation"
              badge="deal rewriter" badgeClass="badge-teal"
              desc="Rewrites risky clauses into balanced language."
              status={agentsStatus}
              output={data?.agents?.negotiation}
              retrieved={ragInfo?.retrievedChunks?.negotiation}
              total={ragInfo?.totalChunks}
            />
          </div>
        </div>

        {/* Join connector: 3 agents → merger */}
        <JoinConnector status={arrow4} />

        {/* STEP 4 — Merger */}
        <PipelineNode
          icon="04" title="Result Merger"
          sub="Deduplicates outputs from all retrieved chunks per agent"
          badge="Step 4 · Sequential" badgeClass="badge-slate"
          status={mergerStatus} output={mergerOut}
        />

        <Connector status={arrow5} />

        {/* STEP 5 — Approach */}
        <PipelineNode
          icon="05" title="Approach Synthesizer"
          sub="Generates best-action recommendation from merged risk output"
          badge="Step 5 · Sequential" badgeClass="badge-slate"
          status={approachStatus} output={approachOut}
        />

      </div>
    </div>
  )
}
