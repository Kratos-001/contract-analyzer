"""
Legal Contract Analyzer — Python/FastAPI backend
Pipeline: Validate → Orchestrate → Embed → ChromaDB → RAG Retrieve → Agents → Merge → Approach
"""

import os
import re
import uuid
import asyncio
import tempfile
import logging
from pathlib import Path
from typing import Optional

import chromadb
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from openai import AsyncOpenAI
import pypdf

# ─── Setup ────────────────────────────────────────────────────────────────────
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("contract-analyzer")

openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ChromaDB — ephemeral in-memory client (no disk, no persistence — stateless by design)
chroma_client = chromadb.EphemeralClient()
log.info("ChromaDB EphemeralClient ready (version %s)", chromadb.__version__)

app = FastAPI(title="Contract Analyzer")

UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
PUBLIC_DIR = Path(__file__).parent / "public"

EMBEDDING_MODEL = "text-embedding-3-small"

# ─── Recursive Chunker ────────────────────────────────────────────────────────
class RecursiveChunker:
    def __init__(self, max_chunk_size: int = 1500, overlap: int = 300):
        self.max_chunk_size = max_chunk_size
        self.overlap        = overlap
        self.separators     = ["\n\n\n", "\n\n", "\n", ". ", ", ", " "]

    def chunk(self, text: str) -> list[dict]:
        cleaned = text.replace("\r\n", "\n").replace("\t", " ").strip()

        if len(cleaned) <= self.max_chunk_size:
            log.info("Document fits in a single chunk (%d chars)", len(cleaned))
            return [{"text": cleaned, "index": 0, "start": 0,
                     "end": len(cleaned), "has_overlap": False}]

        raw = self._recursive_split(cleaned, self.separators)
        log.info("Recursive split → %d raw chunks", len(raw))

        result = []
        for i, c in enumerate(raw):
            if i == 0:
                result.append({**c, "index": 0, "has_overlap": False})
            else:
                overlap_text = raw[i - 1]["text"][-self.overlap:]
                result.append({
                    **c,
                    "index": i,
                    "text": overlap_text + "\n[CONTINUED FROM PREVIOUS SECTION]\n" + c["text"],
                    "has_overlap": True,
                })
        return result

    def _recursive_split(self, text: str, separators: list[str]) -> list[dict]:
        if len(text) <= self.max_chunk_size:
            return [{"text": text, "start": 0, "end": len(text)}]

        if not separators:
            chunks, i = [], 0
            while i < len(text):
                chunks.append({"text": text[i:i + self.max_chunk_size],
                                "start": i,
                                "end": min(i + self.max_chunk_size, len(text))})
                i += self.max_chunk_size
            return chunks

        sep, *rest = separators
        parts = text.split(sep)
        chunks, current, current_start = [], "", 0

        for part in parts:
            candidate = current + sep + part if current else part
            if len(candidate) <= self.max_chunk_size:
                current = candidate
            else:
                if current:
                    if len(current) > self.max_chunk_size and rest:
                        chunks.extend(self._recursive_split(current, rest))
                    else:
                        chunks.append({"text": current, "start": current_start,
                                       "end": current_start + len(current)})
                    current_start += len(current) + len(sep)
                current = part

        if current:
            if len(current) > self.max_chunk_size and rest:
                chunks.extend(self._recursive_split(current, rest))
            else:
                chunks.append({"text": current, "start": current_start,
                               "end": current_start + len(current)})
        return chunks


chunker = RecursiveChunker(max_chunk_size=1500, overlap=300)

# ─── Embedding helper (OpenAI async) ─────────────────────────────────────────
async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts using OpenAI text-embedding-3-small."""
    log.info("  [Embed] Sending %d text(s) to %s", len(texts), EMBEDDING_MODEL)
    response = await openai_client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts,
    )
    log.info("  [Embed] Received %d embedding(s), dim=%d",
             len(response.data), len(response.data[0].embedding))
    return [item.embedding for item in response.data]

# ─── ChromaDB + RAG ───────────────────────────────────────────────────────────

# Agent-specific semantic queries used to retrieve the most relevant chunks
AGENT_QUERIES = {
    "extractor": (
        "contract clauses sections obligations payment terms intellectual property "
        "confidentiality scope services deliverables parties responsibilities"
    ),
    "risk": (
        "dangerous unfair one-sided liability limitation termination penalty "
        "indemnification non-compete warranty waiver governing law jurisdiction "
        "withhold payment unlimited damages"
    ),
    "negotiation": (
        "problematic imbalanced clause rewrite unfair payment ip ownership termination "
        "notice period liability cap revision improvement amendment"
    ),
}

def _compute_top_k(chunk_count: int) -> int:
    """How many chunks each agent retrieves via RAG."""
    if chunk_count <= 4:
        return chunk_count          # small doc — retrieve all
    if chunk_count <= 8:
        return max(4, chunk_count // 2 + 1)
    return max(5, int(chunk_count * 0.6))   # large doc — top 60%

async def embed_and_store(chunks: list[dict]) -> tuple[str, list[list[float]]]:
    """
    Embeds all chunks + 3 agent queries in one batched OpenAI call,
    stores chunk embeddings in a new ChromaDB collection.
    Returns (collection_name, agent_query_embeddings).
    """
    chunk_texts = [c["text"] for c in chunks]
    query_texts = [AGENT_QUERIES["extractor"],
                   AGENT_QUERIES["risk"],
                   AGENT_QUERIES["negotiation"]]

    # Single batch call: chunks + queries
    all_embeddings = await embed_texts(chunk_texts + query_texts)

    chunk_embeddings  = all_embeddings[:len(chunks)]
    query_embeddings  = all_embeddings[len(chunks):]   # [ext, risk, nego]

    # Store chunks in ChromaDB
    col_name = f"contract_{uuid.uuid4().hex}"
    log.info("  [ChromaDB] Creating collection '%s' with %d chunk(s)", col_name, len(chunks))

    collection = chroma_client.create_collection(name=col_name)
    collection.add(
        documents=chunk_texts,
        embeddings=chunk_embeddings,
        ids=[f"chunk_{i}" for i in range(len(chunks))],
        metadatas=[{"index": i, "has_overlap": chunks[i]["has_overlap"]}
                   for i in range(len(chunks))],
    )
    log.info("  [ChromaDB] %d chunk(s) stored successfully", len(chunks))
    return col_name, query_embeddings


def rag_retrieve(col_name: str, query_embeddings: list[list[float]],
                 top_k: int) -> dict[str, list[str]]:
    """
    Queries ChromaDB with each agent's embedding, returns top-k chunk texts.
    """
    collection = chroma_client.get_collection(col_name)

    retrieved = {}
    agent_names = ["extractor", "risk", "negotiation"]

    for agent, emb in zip(agent_names, query_embeddings):
        results = collection.query(
            query_embeddings=[emb],
            n_results=top_k,
        )
        retrieved[agent] = results["documents"][0]   # list[str] of chunk texts
        distances = results["distances"][0]
        log.info("  [RAG] %-14s → retrieved %d chunk(s) | distances: %s",
                 agent, len(retrieved[agent]),
                 [f"{d:.3f}" for d in distances])

    return retrieved


def cleanup_collection(col_name: str) -> None:
    try:
        chroma_client.delete_collection(col_name)
        log.info("  [ChromaDB] Collection '%s' deleted (ephemeral cleanup)", col_name)
    except Exception:
        pass

# ─── Result Mergers ───────────────────────────────────────────────────────────
def _normalize_clause(name: str) -> str:
    """Lowercase + collapse whitespace + strip punctuation for fuzzy dedup."""
    return re.sub(r'[\s\-_.#]+', ' ', name.lower()).strip()

def merge_extractor_results(results: list[str]) -> str:
    """Deduplicate by normalized clause name — keeps first occurrence."""
    seen: set[str] = set()
    merged = []
    for block in "\n---\n".join(results).split("---"):
        block = block.strip()
        if not block:
            continue
        m = re.search(r"CLAUSE:\s*(.+)", block)
        if not m:
            continue
        key = _normalize_clause(m.group(1))
        if key in seen:
            continue
        seen.add(key)
        merged.append(block)
    return "\n---\n".join(merged)

def merge_risk_results(results: list[str]) -> str:
    """
    Deduplicate by normalized clause name.
    When the same clause appears in multiple chunks, keep the HIGHEST severity version.
    This prevents duplicate counting that inflates HIGH risk scores.
    """
    SEVERITY_RANK = {'HIGH': 3, 'MEDIUM': 2, 'LOW': 1}
    # clause_key -> (severity_rank, block_text)
    best: dict[str, tuple[int, str]] = {}

    for block in "\n---\n".join(results).split("---"):
        block = block.strip()
        if not block:
            continue
        clause_m = re.search(r"CLAUSE:\s*(.+)", block)
        sev_m    = re.search(r"SEVERITY:\s*(.+)", block)
        if not clause_m or not sev_m:
            continue
        key  = _normalize_clause(clause_m.group(1))
        rank = SEVERITY_RANK.get(sev_m.group(1).strip().upper(), 0)
        if key not in best or rank > best[key][0]:
            best[key] = (rank, block)

    return "\n---\n".join(block for _, block in best.values())

def merge_negotiation_results(results: list[str]) -> str:
    """Deduplicate by normalized clause name — keeps first occurrence."""
    seen: set[str] = set()
    merged = []
    for block in "\n---\n".join(results).split("---"):
        block = block.strip()
        if not block:
            continue
        m = re.search(r"CLAUSE:\s*(.+)", block)
        if not m:
            continue
        key = _normalize_clause(m.group(1))
        if key in seen:
            continue
        seen.add(key)
        merged.append(block)
    return "\n---\n".join(merged)

def count_severity(risk_text: str, level: str) -> int:
    return len(re.findall(rf"SEVERITY:\s*{level}", risk_text))

# ─── Field parser ──────────────────────────────────────────────────────────────
def parse_field(text: str, field: str) -> str:
    m = re.search(rf"{field}:\s*([\s\S]+?)(?=\n[A-Z_]+:|$)", text)
    return m.group(1).strip() if m else ""

# ─── LLM helper ───────────────────────────────────────────────────────────────
async def call_openai(system_prompt: str, user_message: str,
                      max_tokens: int = 800) -> str:
    log.info("    → OpenAI GPT-4o | max_tokens=%d | system=%.55s…",
             max_tokens, system_prompt)
    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        temperature=0,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_message},
        ],
    )
    result = response.choices[0].message.content.strip()
    log.info("    ← GPT-4o reply | %d chars", len(result))
    return result

# ─── System Prompts ────────────────────────────────────────────────────────────
def orchestrator_system(chunk_count: int, top_k: int) -> str:
    return f"""You are a strict document validation gateway AND a legal contract review orchestrator.
First, decide if the uploaded document is a valid legal contract.
Valid: service agreement, NDA, employment contract, SaaS agreement, lease agreement, partnership deed, vendor contract, etc.
Invalid: recipes, essays, news articles, stories, resumes, code files, emails, chat logs, academic papers.

If VALID=NO, do not output a PLAN.
If VALID=YES, the contract was split into {chunk_count} chunk(s) and embedded into ChromaDB. 
You are managing 3 specialist agents (Clause Extractor, Risk Analyzer, Negotiation Agent). Each will retrieve the {top_k} most relevant chunks via RAG.
Provide a 2-3 sentence PLAN explaining what each agent receives and why RAG-based retrieval ensures coverage.

Respond ONLY in this exact format:
VALID: [YES or NO]
DOCUMENT_TYPE: [what the document actually is]
REASON: [one sentence]
MISSING: [if NO — what makes it not a contract. If YES — write NONE]
PLAN: [if YES — your orchestration plan. If NO — write NONE]"""

EXTRACTOR_SYSTEM = """You are a legal clause extractor. Read the contract section neutrally — facts only, zero opinion.
For every clause or section output:
CLAUSE: [section name or number]
TYPE: [Payment/IP/Liability/Termination/Confidentiality/Scope/Governing Law/Other]
OBLIGATIONS_ON_PARTY_A: [what party A must do — one clear sentence]
OBLIGATIONS_ON_PARTY_B: [what party B must do — one clear sentence]
KEY_TERMS: [specific numbers, timeframes, dollar amounts, or conditions. Write NONE if none.]
---
Separate each clause block with ---
If this chunk is a continuation (marked [CONTINUED FROM PREVIOUS SECTION]), only extract NEW clauses not already covered."""

RISK_SYSTEM = """You are an adversarial defense lawyer reviewing this contract on behalf of the weaker party (typically the vendor or service provider).

SEVERITY RUBRIC — apply this strictly and honestly:
  HIGH   → A clause that could cause catastrophic harm if enforced as written: unlimited or grossly asymmetric liability, loss of pre-existing IP, immediate termination without recourse, forced refund of all past payments, permanent or global non-compete, or jurisdiction chosen unilaterally by the other party. Reserve HIGH for truly dangerous terms. Most balanced contracts have 0–2 HIGH issues.
  MEDIUM → Genuinely unfair or one-sided but survivable. The weaker party is disadvantaged but not ruined. Examples: 60-day notice required from vendor but 0 from client, non-mutual confidentiality term, short cure period, below-market liability cap.
  LOW    → Minor imbalance, missing standard protection, or vague language worth noting. The weaker party can proceed with awareness. Examples: no late-payment interest, ambiguous definition, missing force majeure clause.

IMPORTANT RULES:
- If a clause is mutual, balanced, or standard boilerplate, DO NOT flag it.
- Do not manufacture issues. Only flag real problems visible in this text.
- Do not pad findings — if a chunk has only 1 real issue, output 1 block.
- If a section is genuinely fair, skip it entirely.
- OVERLAP RULE: If this chunk is marked [CONTINUED FROM PREVIOUS SECTION], the text before that marker is overlap — IGNORE it completely. Only analyze clauses that appear AFTER the [CONTINUED FROM PREVIOUS SECTION] marker.

For each genuine issue output EXACTLY:
SEVERITY: [HIGH/MEDIUM/LOW]
CLAUSE: [the exact section name or number as it appears in the contract]
RISK: [the specific danger explained in plain English — what is wrong with this clause]
IMPACT: [what could realistically happen to the weaker party if this clause is enforced exactly as written]
---
Separate each finding with ---"""

NEGOTIATION_SYSTEM = """You are a contract negotiation specialist. Rewrite problematic clauses into fair, balanced language.
For each problematic clause output EXACTLY:
CLAUSE: [section name or number]
PROBLEM: [one sentence — what is unfair or dangerous]
ORIGINAL: [a brief direct quote of the most problematic language]
REWRITE: [your complete improved version — professional, specific, ready-to-use]
---
Separate each rewrite with ---
If this is a continuation, only rewrite NEW clauses."""

APPROACH_SYSTEM = """You are a senior legal strategist. Based on the risk analysis, give the best overall recommendation for the weaker party.

VERDICT CALIBRATION — choose based on the actual findings:
  DO NOT SIGN        → 5 or more HIGH severity issues, or any single clause that could cause financial ruin or permanent loss of core rights.
  NEGOTIATE FIRST    → 2–4 HIGH severity issues. The contract is materially one-sided and must be renegotiated before signing.
  SIGN WITH CAUTION  → 0–1 HIGH issues but several MEDIUM issues. Proceed carefully with awareness of the risks.
  SAFE TO SIGN       → No HIGH issues and few or minor MEDIUM/LOW issues. The contract is broadly fair and reasonable.

Base your verdict on the actual content and severity of findings — not just the count. A contract with 1 HIGH issue may warrant NEGOTIATE FIRST if that clause is catastrophic.

Output EXACTLY in this format — no extra text:
VERDICT: [exactly one of: DO NOT SIGN / NEGOTIATE FIRST / SIGN WITH CAUTION / SAFE TO SIGN]
REASONING: [2-3 sentences explaining the overall contract situation and why this specific verdict was chosen]
STEP_1: [first concrete action the weaker party should take — be specific]
STEP_2: [second concrete action — be specific]
STEP_3: [third concrete action — be specific]
PRIORITY_CLAUSE: [the single most important clause to address first — name it and explain in one sentence why it is the top priority. Write NONE if no critical issues exist.]"""

# ─── Sample contract ───────────────────────────────────────────────────────────
SAMPLE_CONTRACT = (
    'SERVICE AGREEMENT — This Agreement is entered into between ACME Corp ("Client") '
    'and DevStudio LLC ("Vendor"). '
    "1. SERVICES: Vendor shall provide software development services as requested by Client at any time. "
    "Client may modify the scope of work without notice or compensation adjustment. "
    "2. PAYMENT: Client shall pay Vendor within 90 days of invoice. Late payments shall not incur interest. "
    "Client reserves the right to withhold payment if dissatisfied with deliverables at Client's sole discretion. "
    "3. INTELLECTUAL PROPERTY: All work product and deliverables produced by Vendor shall be the exclusive property of Client, "
    "including any pre-existing tools or frameworks used by Vendor. "
    "4. CONFIDENTIALITY: Vendor shall maintain strict confidentiality of all Client information indefinitely. "
    "Vendor shall not work for any Client competitor for 3 years post-termination, globally. "
    "5. LIABILITY: Vendor's total liability shall not exceed $500. Client may seek unlimited damages from Vendor for any breach. "
    "6. TERMINATION: Client may terminate immediately without cause. Vendor must provide 180 days notice. "
    "Upon termination Vendor must refund all payments received in the last 12 months. "
    "7. GOVERNING LAW: Governed by Client's chosen jurisdiction determined by Client at time of dispute."
)

# ─── Text extraction ───────────────────────────────────────────────────────────
async def extract_text(file: UploadFile) -> str:
    suffix   = Path(file.filename or "file.txt").suffix.lower()
    contents = await file.read()

    if suffix == ".pdf":
        log.info("Extracting text from PDF: %s", file.filename)
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name
        try:
            reader = pypdf.PdfReader(tmp_path)
            return "\n".join(p.extract_text() or "" for p in reader.pages)
        finally:
            os.unlink(tmp_path)

    log.info("Reading text file: %s", file.filename)
    return contents.decode("utf-8", errors="replace")

# ─── Routes ────────────────────────────────────────────────────────────────────
@app.get("/api/sample")
async def get_sample():
    return {"text": SAMPLE_CONTRACT}


@app.post("/api/analyze")
async def analyze(
    contract: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
):
    # ── 1. Extract text ──────────────────────────────────────────────────────
    if contract and contract.filename:
        contract_text = await extract_text(contract)
    elif text:
        contract_text = text
    else:
        raise HTTPException(status_code=400, detail="No contract text or file provided.")

    contract_text = contract_text.strip()
    if not contract_text:
        raise HTTPException(status_code=400, detail="Contract text is empty.")

    # ── 2. STEP 1 — Chunking ────────────────────────────────────────────────
    log.info("═" * 60)
    log.info("Chunking  (%d total chars)", len(contract_text))
    chunks      = chunker.chunk(contract_text)
    chunk_count = len(chunks)
    top_k       = _compute_top_k(chunk_count)

    for i, c in enumerate(chunks):
        log.info("  Chunk %d: %d chars | has_overlap=%s",
                 i + 1, len(c["text"]), c["has_overlap"])

    # ── 3. STEP 2 — Orchestrator Gate (validation + planning) ───────────────
    log.info("─" * 60)
    log.info("STEP 1 & 2 combined — Orchestrator Gate  (sequential)")
    
    validation_result = await call_openai(
        orchestrator_system(chunk_count, top_k),
        f"Document preview (first 1500 chars):\n{contract_text[:1500]}",
        max_tokens=400,
    )
    log.info("Orchestrator result:\n%s", validation_result)

    is_valid      = parse_field(validation_result, "VALID") == "YES"
    document_type = parse_field(validation_result, "DOCUMENT_TYPE") or "Unknown"
    reason        = parse_field(validation_result, "REASON")
    missing       = parse_field(validation_result, "MISSING")
    orch_plan     = parse_field(validation_result, "PLAN")

    if not is_valid:
        log.warning("REJECTED — type: %s | reason: %s", document_type, reason)
        return JSONResponse(content={"valid": False, "documentType": document_type,
                                     "reason": reason, "missing": missing})

    log.info("VALID — type: %s", document_type)

    # ── 5. STEP 3 — Embed chunks + store in ChromaDB ─────────────────────────
    log.info("─" * 60)
    log.info("STEP 3 — Embedding %d chunk(s) + 3 agent queries → ChromaDB", chunk_count)

    col_name, query_embeddings = await embed_and_store(chunks)

    # ── 6. STEP 4 — RAG retrieval per agent ──────────────────────────────────
    log.info("─" * 60)
    log.info("STEP 4 — RAG retrieval  (top_k=%d per agent)", top_k)

    retrieved = rag_retrieve(col_name, query_embeddings, top_k)

    retrieved_counts = {a: len(v) for a, v in retrieved.items()}
    log.info("Retrieved chunks: %s", retrieved_counts)

    # ── 7. STEP 5 — Agents on RAG-retrieved chunks (parallel) ────────────────
    log.info("─" * 60)
    total_calls = sum(retrieved_counts.values())
    log.info("STEP 5 — Agents on RAG chunks  (%d total parallel LLM calls)", total_calls)

    async def run_agent(agent_name: str, system: str, max_tokens: int) -> list[str]:
        agent_chunks = retrieved[agent_name]
        total = len(agent_chunks)
        log.info("  Agent %-14s → %d chunk(s) in parallel", agent_name, total)
        tasks = [
            call_openai(
                system,
                f"CONTRACT SECTION (retrieved chunk {i + 1} of {total}):\n{chunk_text}",
                max_tokens=max_tokens,
            )
            for i, chunk_text in enumerate(agent_chunks)
        ]
        return await asyncio.gather(*tasks)

    extractor_results, risk_results, negotiation_results = await asyncio.gather(
        run_agent("extractor",   EXTRACTOR_SYSTEM,   max_tokens=800),
        run_agent("risk",        RISK_SYSTEM,         max_tokens=800),
        run_agent("negotiation", NEGOTIATION_SYSTEM,  max_tokens=900),
    )

    # ── 8. Cleanup ChromaDB collection ───────────────────────────────────────
    cleanup_collection(col_name)

    # ── 9. Merge results ─────────────────────────────────────────────────────
    log.info("─" * 60)
    log.info("STEP 6 — Merging results…")
    merged_extractor   = merge_extractor_results(extractor_results)
    merged_risk        = merge_risk_results(risk_results)
    merged_negotiation = merge_negotiation_results(negotiation_results)

    high_count = count_severity(merged_risk, "HIGH")
    med_count  = count_severity(merged_risk, "MEDIUM")
    log.info("Merged risk: HIGH=%d  MEDIUM=%d", high_count, med_count)

    # ── 10. STEP 7 — Approach synthesizer (sequential) ───────────────────────
    log.info("─" * 60)
    log.info("STEP 7 — Approach synthesizer  (sequential)")
    approach = await call_openai(
        APPROACH_SYSTEM,
        f"HIGH SEVERITY ISSUES FOUND: {high_count}\n"
        f"MEDIUM SEVERITY ISSUES FOUND: {med_count}\n\n"
        f"MERGED RISK ANALYSIS:\n{merged_risk}",
        max_tokens=500,
    )
    log.info("Approach:\n%s", approach)
    log.info("═" * 60)
    log.info("Analysis complete.")

    return JSONResponse(content={
        "valid":            True,
        "documentType":     document_type,
        "chunkCount":       chunk_count,
        "orchestratorPlan": orch_plan,
        "agents": {
            "extractor":   merged_extractor,
            "risk":        merged_risk,
            "negotiation": merged_negotiation,
        },
        "approach": approach,
        "meta": {
            "highRiskCount":   high_count,
            "mediumRiskCount": med_count,
        },
        "ragInfo": {
            "embeddingModel": EMBEDDING_MODEL,
            "vectorStore":    f"ChromaDB {chromadb.__version__} (ephemeral in-memory)",
            "totalChunks":    chunk_count,
            "topK":           top_k,
            "retrievedChunks": retrieved_counts,
        },
    })

# ─── Serve frontend ────────────────────────────────────────────────────────────
app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="static")

# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=3000, reload=True, log_level="info")
