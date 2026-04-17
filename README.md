# Curalink — AI Medical Research Assistant Backend

RAG-powered backend that retrieves real medical research from PubMed, OpenAlex, and ClinicalTrials.gov, re-ranks it, and generates structured insights using LLaMA 3.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| LLM | LLaMA 3.3 70B via Groq (open-source, free) |
| Embeddings | Google gemini-embedding-001 (768-dim) |
| Vector DB | Pinecone (cosine similarity) |
| Metadata DB | MongoDB Atlas |
| Data Sources | PubMed, OpenAlex, ClinicalTrials.gov |

---

## Architecture

```
User Query
    │
    ▼
[Safety Pre-check] ──── CRITICAL/HIGH ──→ 403 SAFETY_BLOCK
    │
    ▼
[Query Understanding]
  · Extract condition (e.g. "lung cancer")
  · Extract intent (treatment/research/clinical_trials/researchers)
  · Extract timeframe (latest/recent/historical)
    │
    ▼
[Query Router]
  · Check Pinecone for existing relevant chunks
  · If < 3 results → Live fetch from PubMed + OpenAlex + ClinicalTrials
    │
    ▼
[Embedding] → gemini-embedding-001 (768-dim)
    │
    ▼
[Pinecone Vector Search] → top-k retrieval
    │
    ▼
[Re-Ranking]
  · Relevance score (50%) — Pinecone cosine similarity
  · Recency score (30%) — newer papers ranked higher
  · Source credibility (20%) — PubMed > OpenAlex > ClinicalTrials > PDF
    │
    ▼
[Prompt Builder] → structured JSON prompt with context
    │
    ▼
[Conversation History] → last 4 turns injected for multi-turn support
    │
    ▼
[LLaMA 3.3 70B via Groq] → structured JSON response
    │
    ▼
[Response Parser] → validates JSON, graceful fallback
    │
    ▼
Structured Response:
  conditionOverview | researchInsights | clinicalTrials | experts | sources
```

---

## Chunking Strategy

**Sentence-boundary aware chunking with overlap:**
- Chunk size: ~500 tokens (~2000 chars)
- Overlap: 50 tokens between consecutive chunks
- Splits on sentence boundaries (`.`, `!`, `?`) — never cuts mid-sentence
- Preserves semantic meaning across chunk boundaries
- Each chunk stores full metadata: `paperId`, `title`, `authors`, `year`, `source`, `url`

This approach ensures retrieved chunks are always coherent and self-contained, improving LLM grounding quality.

---

## Setup

### 1. Install
```bash
npm install
```

### 2. Configure
```bash
cp .env.example .env
```
Fill in:
- `MONGODB_URI` — MongoDB Atlas connection string
- `GEMINI_API_KEY` — Google AI Studio (aistudio.google.com)
- `PINECONE_API_KEY` — Pinecone (pinecone.io) — index: `health-copilot`, dims: 768, metric: cosine
- `GROQ_API_KEY` — Groq (console.groq.com) — free, no credit card

### 3. Pre-load demo data
```bash
npm run preload-demo
```
This fetches real papers for all 4 hackathon demo queries. Takes ~2 minutes.

### 4. Start
```bash
npm run dev
```

---

## API Endpoints

### `GET /api/health`
Server + MongoDB + Pinecone status.

### `POST /api/research/ingest`
Fetch and ingest papers from live sources.
```json
{ "query": "lung cancer", "sources": ["pubmed", "openalex", "clinicaltrials"], "maxPerSource": 5 }
```

### `GET /api/research/papers`
List ingested papers. Query params: `source`, `query`, `limit`.

### `GET /api/research/stats`
Total papers by source, LLM model, embedding model.

### `POST /api/upload`
Upload a PDF for manual ingestion.

### `POST /api/ask`
Main RAG query endpoint.
```json
{
  "query": "Latest treatment for lung cancer",
  "sessionId": "optional-for-multi-turn"
}
```
Response includes: `conditionOverview`, `researchInsights`, `clinicalTrials`, `experts`, `sources`, `freshFetch`, `sessionId`.

### `GET /api/conversations/:sessionId`
Retrieve conversation history.

---

## Demo Queries (Hackathon)

```
1. Latest treatment for lung cancer
2. Clinical trials for diabetes
3. Top researchers in Alzheimer's disease
4. Recent studies on heart disease
```

---

## Re-Ranking Logic

```
rankingScore = 0.5 × relevance + 0.3 × recency + 0.2 × credibility

recency:     normalized year (2000=0, 2026=1)
credibility: PubMed=1.0, OpenAlex=0.85, ClinicalTrials=0.75, PDF=0.6
```

---

## Safety Layer

| Severity | Trigger | Action |
|---|---|---|
| CRITICAL | heart attack, overdose, suicidal | 403 block + emergency resources |
| HIGH | diagnose me, do I have X | 403 block |
| MEDIUM | depression, HIV, addiction | Allow + empathetic disclaimer |
| LOW | symptoms of, what causes | Allow + informational disclaimer |
