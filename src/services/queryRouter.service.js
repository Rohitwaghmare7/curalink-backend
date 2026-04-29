const { searchPapers: pubmedSearch } = require("../services/pubmed.service");
const { searchPapers: openalexSearch } = require("../services/openalex.service");
const { searchTrials } = require("../services/clinicaltrials.service");
const { runResearchIngestionPipeline } = require("../pipelines/research.ingestion.pipeline");
const { generateEmbedding } = require("./embedding.service");
const { search } = require("./retrieval.service");
const { buildExpandedQuery } = require("./intent.service");
const logger = require("../utils/logger");

const FRESH_FETCH_THRESHOLD = parseInt(process.env.FRESH_FETCH_THRESHOLD) || 3;
const MIN_SCORE = parseFloat(process.env.MIN_RETRIEVAL_SCORE) || 0.5;
const MAX_PER_SOURCE = parseInt(process.env.MAX_PAPERS_PER_SOURCE) || 10;

const SOURCE_FETCHERS = {
  pubmed: (query, max) => pubmedSearch(query, max),
  openalex: (query, max) => openalexSearch(query, max),
  clinicaltrials: (query, max) => searchTrials(query, max),
};

/**
 * NEW FAST-PATH FLOW:
 * 1. Check Pinecone (vector store) first — instant if data is cached.
 * 2. If enough results → return them immediately (no live fetch needed).
 * 3. If not enough → fetch LIVE from APIs in parallel (no embedding wait).
 *    - Return raw live papers directly for LLM to use.
 *    - Store embeddings in the BACKGROUND (does not block response).
 */
const routeQuery = async (query, condition, existingEmbedding = null, disease = null, skipLiveFetch = false) => {
  const focusCondition = disease || condition;
  const expandedQuery = buildExpandedQuery(query, focusCondition);
  const searchTerm = expandedQuery || focusCondition || query;

  logger.info(`[QueryRouter] Primary search term: "${searchTerm}"`);

  // ── Step 1: Check Pinecone (vector cache) ──────────────────────────────────
  const embedding = existingEmbedding || await generateEmbedding(searchTerm);
  const existing = await search(embedding, { topK: 10, minScore: MIN_SCORE });

  // Count how many results are actually relevant to the condition
  const conditionKeyword = (focusCondition || "").toLowerCase();
  const relevantCount = conditionKeyword
    ? existing.filter((c) => {
      const text = `${c.title || ""} ${c.text || ""}`.toLowerCase();
      return text.includes(conditionKeyword) ||
        (c.condition && c.condition.toLowerCase().includes(conditionKeyword));
    }).length
    : existing.length;

  logger.info(`[QueryRouter] ${relevantCount}/${existing.length} chunks match condition "${conditionKeyword}"`);

  // ── Step 2: Enough cached results → return immediately ────────────────────
  if (relevantCount >= FRESH_FETCH_THRESHOLD || skipLiveFetch) {
    logger.info(`[QueryRouter] Using cached Pinecone results — no live fetch needed.`);
    return {
      freshFetch: false,
      fetchedFrom: [],
      livePapers: [],       // no live papers, Pinecone has it covered
      embedding,
      expandedQuery: searchTerm,
    };
  }

  // ── Step 3: Not enough cached → fetch LIVE in parallel ───────────────────
  logger.info(`[QueryRouter] Insufficient cache — fetching LIVE from APIs for: "${searchTerm}"`);
  const sources = ["pubmed", "openalex", "clinicaltrials"];

  const fetchPromises = sources.map((s) =>
    SOURCE_FETCHERS[s](searchTerm, MAX_PER_SOURCE).catch((err) => {
      logger.error(`[QueryRouter] ${s} live fetch failed: ${err.message}`);
      return [];
    })
  );

  const fetched = (await Promise.all(fetchPromises)).flat();
  logger.info(`[QueryRouter] Live fetched ${fetched.length} papers — passing directly to LLM.`);

  // ── Step 4: [DISABLED] Store embeddings in BACKGROUND (non-blocking) ─────
  // Removed per user request to stop background embedding during live fetch.

  return {
    freshFetch: fetched.length > 0,
    fetchedFrom: sources,
    livePapers: fetched,    // passed directly to RAG pipeline for LLM context
    embedding,
    expandedQuery: searchTerm,
  };
};

module.exports = { routeQuery };
