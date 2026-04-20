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
const routeQuery = async (query, condition, existingEmbedding = null, disease = null, skipLiveFetch = false) => {
  // Use explicit disease if provided, else use inherited condition
  const focusCondition = disease || condition;
  
  // Build expanded search term for RAG precision
  const expandedQuery = buildExpandedQuery(query, focusCondition);
  const searchTerm = expandedQuery || focusCondition || query;

  logger.info(`[QueryRouter] Primary search term: "${searchTerm}"`);

  // Generate embedding for the expanded query (for best RAG match if condition is correct)
  const embedding = existingEmbedding || await generateEmbedding(searchTerm);

  // Check current Pinecone results for the search term
  const existing = await search(embedding, { topK: 10, minScore: MIN_SCORE });
  
  // If we have no results with the expanded query, try searching for just the original query
  // to see if the user has changed the topic.
  let finalResults = existing;
  let finalEmbedding = embedding;
  let finalSearchTerm = searchTerm;

  if (existing.length < FRESH_FETCH_THRESHOLD && query && focusCondition && query.toLowerCase() !== focusCondition.toLowerCase()) {
    logger.info(`[QueryRouter] Low matches for expanded query. Trying original query: "${query}"`);
    const queryOnlyEmbedding = await generateEmbedding(query);
    const queryOnlyResults = await search(queryOnlyEmbedding, { topK: 10, minScore: MIN_SCORE });
    
    if (queryOnlyResults.length > existing.length) {
      logger.info(`[QueryRouter] Original query found more results (${queryOnlyResults.length}). Switching focus.`);
      finalResults = queryOnlyResults;
      finalEmbedding = queryOnlyEmbedding;
      finalSearchTerm = query;
    }
  }

  const conditionKeyword = (focusCondition || '').toLowerCase();
  const relevantToCondition = conditionKeyword
    ? finalResults.filter((c) => {
      const text = `${c.title || ''} ${c.text || ''}`.toLowerCase();
      return text.includes(conditionKeyword) ||
        (c.condition && c.condition.toLowerCase().includes(conditionKeyword));
    })
    : finalResults;

  const relevantCount = relevantToCondition.length;
  logger.info(`[QueryRouter] ${relevantCount}/${finalResults.length} chunks match condition "${conditionKeyword}"`);

  // If we have enough relevant results, return them
  if (relevantCount >= FRESH_FETCH_THRESHOLD || skipLiveFetch) {
    return { freshFetch: false, fetchedFrom: [], embedding: finalEmbedding, expandedQuery: finalSearchTerm };
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
