const { runResearchIngestionPipeline } = require("../pipelines/research.ingestion.pipeline");
const { generateEmbedding } = require("./embedding.service");
const { search } = require("./retrieval.service");
const { buildExpandedQuery } = require("./intent.service");
const logger = require("../utils/logger");

const FRESH_FETCH_THRESHOLD = parseInt(process.env.FRESH_FETCH_THRESHOLD) || 3;
const MIN_SCORE = parseFloat(process.env.MIN_RETRIEVAL_SCORE) || 0.5;
const MAX_PER_SOURCE = parseInt(process.env.MAX_PAPERS_PER_SOURCE) || 50;

/**
 * Checks if Pinecone has enough relevant results for a query.
 * If not, triggers a live fetch from PubMed + OpenAlex + ClinicalTrials, then re-queries.
 * Uses expanded query (additionalQuery AND disease) for API searches.
 */
const routeQuery = async (query, condition, existingEmbedding = null, disease = null) => {
  // Build expanded search term: "deep brain stimulation AND parkinson's disease"
  const expandedQuery = buildExpandedQuery(query, disease || condition);
  const searchTerm = expandedQuery || condition || query;

  logger.info(`[QueryRouter] Expanded query: "${searchTerm}"`);

  // Use provided embedding or generate one from the expanded query
  const embedding = existingEmbedding || await generateEmbedding(searchTerm);

  // Check current Pinecone results
  const existing = await search(embedding, { topK: 10, minScore: MIN_SCORE });
  logger.info(`[QueryRouter] Found ${existing.length} relevant chunks (threshold: ${FRESH_FETCH_THRESHOLD})`);

  // Extra check: if we have results but they're about a DIFFERENT condition,
  // force a live fetch. Compare the condition keyword against chunk titles/text.
  const conditionKeyword = (disease || condition || '').toLowerCase();
  const relevantToCondition = conditionKeyword
    ? existing.filter((c) => {
        const text = `${c.title || ''} ${c.text || ''}`.toLowerCase();
        return text.includes(conditionKeyword) ||
               // Also accept if the chunk's own condition field matches
               (c.condition && c.condition.toLowerCase().includes(conditionKeyword));
      })
    : existing;

  const relevantCount = relevantToCondition.length;
  logger.info(`[QueryRouter] ${relevantCount}/${existing.length} chunks match condition "${conditionKeyword}"`);

  if (relevantCount >= FRESH_FETCH_THRESHOLD) {
    return { freshFetch: false, fetchedFrom: [], embedding, expandedQuery: searchTerm };
  }

  // Not enough results — trigger live fetch with expanded query
  logger.info(`[QueryRouter] Insufficient results — fetching live data for: "${searchTerm}"`);

  try {
    const result = await runResearchIngestionPipeline({
      query: searchTerm,
      sources: ["pubmed", "openalex", "clinicaltrials"],
      maxPerSource: MAX_PER_SOURCE,
    });

    const fetchedFrom = result.ingested > 0 ? ["pubmed", "openalex", "clinicaltrials"] : [];

    logger.info(`[QueryRouter] Live fetch complete — ingested: ${result.ingested}`);
    return { freshFetch: result.ingested > 0, fetchedFrom, embedding, expandedQuery: searchTerm };
  } catch (err) {
    logger.error(`[QueryRouter] Live fetch failed: ${err.message}`);
    return { freshFetch: false, fetchedFrom: [], embedding, expandedQuery: searchTerm };
  }
};

module.exports = { routeQuery };
