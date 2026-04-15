# Contract Analyzer

An advanced, multi-agent AI system designed to automatically review, extract, and strategize over legal contracts. It leverages **RAG (Retrieval-Augmented Generation)** through **ChromaDB** and uses **GPT-4o** to act as a complete legal defense orchestra. 

The application utilizes a **Python/FastAPI backend** for heavy orchestration and semantic processing, married to a highly-polished, enterprise-grade **React/Vite frontend**.

## 🚀 Features

- **Automated Validation Gate:** Protects the pipeline by automatically scanning and rejecting non-legal documents (e.g., essays, recipes, code files).
- **Intelligent RAG Architecture:** Large contracts are chunked recursively (1500 chars with 300 char overlap) and embedded via `text-embedding-3-small` into a fast, inherently stateless/ephemeral ChromaDB vector store.
- **Parallel Multi-Agent Orchestration:** 
  - 📋 **Clause Extractor**: Neutrally reads and maps out dates, obligations, and payments.
  - ⚖️ **Risk Analyzer**: Acts as an adversarial defense lawyer, flagging dangerous clauses as HIGH, MEDIUM, or LOW severity.
  - ✍️ **Negotiation Agent**: Rewrites problematic clauses into fair, commercially reasonable, and balanced language.
- **Deduplication Engine:** Intelligently merges overlapping data across document chunks to prevent duplicate risk counting.
- **Strategic Verdict Generation:** A final strategy layer that assigns a concrete action plan (*DO NOT SIGN, NEGOTIATE FIRST, SIGN WITH CAUTION, SAFE TO SIGN*).
- **Pro-tier UX:** A sleek, fully response React UI that neatly separates the high-level business output from a real-time Developer Pipeline tracing console.

## 🛠 Tech Stack

- **Backend:** Python, FastAPI, Uvicorn, PyPDF.
- **Database (Vector):** ChromaDB (Local Ephemeral).
- **AI Models:** OpenAI API (`gpt-4o` for logic/agents, `text-embedding-3-small` for semantic indexing).
- **Frontend:** React, Vite, Vanilla CSS.

## 📋 System Pipeline

1. **Extract & Validate:** The file (PDF/Text) is extracted. GPT-4o verifies it's a valid contract.
2. **Chunking & Orchestration:** The document is systematically chunked and planned based on the document size.
3. **Embed & Store:** Chunks are vectorized and placed into an ephemeral ChromaDB instance.
4. **Agent RAG Retrieval:** Three domain-specific agents run mathematical similarity searches to pull only the sections of the contract relevant to their exact tasks.
5. **Parallel Agent Execution:** The Extractor, Risk Analyzer, and Negotiator process their contextual chunks independently and concurrently.
6. **Merging & Synthesizing:** The backend deduplicates overlapping results. A final agent synthesizes all risks to provide a recommended business approach.

---

## ⚙️ Local Setup Instructions

### Prerequisites
- Python 3.9+
- Node.js 18+ & npm
- An OpenAI API Key (`OPENAI_API_KEY`)

### 1. Clone the Repository
```bash
git clone https://github.com/Kratos-001/contract-analyzer.git
cd contract-analyzer
```

### 2. Backend Setup (FastAPI)
It is recommended to use a virtual environment.
```bash
# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`

# Install Python dependencies
pip install -r requirements.txt

# Create an env file and add your OpenAI Key
echo "OPENAI_API_KEY=your_api_key_here" > .env

# Run the backend server
python server.py
```
*The backend will boot up on `http://localhost:3000` or `http://127.0.0.1:3000`.*

### 3. Frontend Setup (Vite / React)
In a secondary terminal window:
```bash
cd contract-analyzer/frontend

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```
*The frontend will boot up on `http://localhost:5173`. It is pre-configured to proxy `/api` requests to the Python backend automatically.*

---

## 🔒 Privacy & Security Defaults
* **Ephemeral Database:** The ChromaDB vector store runs entirely in-memory and destroys the data structures upon request completion. No persistent logging of embeddings is configured.
* **OpenAI Zero-Data Retention:** By default, OpenAI API non-consumer usage retains data for a maximum of 30 days and strictly does not use API-fed inputs to train foundational models. (Ensure you review your org-specific OpenAI agreements).
