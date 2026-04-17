const { extractQueryIntent } = require("../services/intent.service");
const { search, filteredSearch } = require("../services/retrieval.service");
const { rerank } = require("../services/reranker.service");
const { routeQuery } = require("../services/queryRouter.service");
const { buildPrompt } = require("../utils/promptBuilder");
const { parseStructuredResponse } = require("../utils/responseParser");
const { complete } = require("../services/llm.service");
const { inspect, shouldBlock, getDisclaimer } = require("../services/safety.service");
const { createSession, getHistory, saveMessages } = require("../services/conversation.service");
const logger = require("../utils/logger");

const runRagPipeline = async ({ query, disease = null, patientName = null, location = null, userId = null, options = {}, sessionId = null }) => {
  const startTime = Date.now();
  logger.info(`[RAG] Query: "${query.slice(0, 80)}" | Disease: ${disease || "none"} | Location: ${location || "none"}`);

  // Resolve or create session
  const activeSessionId = sessionId || createSession();

  // Step 1: Safety pre-check
  const safetyResult = inspect(query);
  if (!safetyResult.isSafe && shouldBlock(safetyResult.triggerType)) {
    logger.warn(`[RAG] Safety block — triggerType: ${safetyResult.triggerType}`);
    const err = new Error(
      safetyResult.triggerType === "emergency"
        ? "This appears to be a medical emergency. Please call emergency services immediately."
        : "This request asks for a personal medical diagnosis. Please consult a qualified healthcare professional."
    );
    err.statusCode = 403;
    err.code = "SAFETY_BLOCK";
    err.triggerType = safetyResult.triggerType;
    err.emergencyResource = "Emergency: 112 (India) · 911 (US)";
    throw err;
  }

  // Step 2: Query understanding — extract condition + intent
  // If disease was passed explicitly, use it; otherwise extract from query
  const { condition: extractedCondition, intent, promptIntent, timeframe } = extractQueryIntent(query);
  const condition = disease || extractedCondition;
  logger.info(`[RAG] Intent: ${intent} | Condition: ${condition || "unknown"} | Timeframe: ${timeframe || "any"}`);

  // Step 2b: Load conversation history early — needed for context-aware retrieval
  const history = await getHistory(activeSessionId);

  // Step 2c: If no condition found in current query, extract from previous conversation turns
  // This ensures follow-up queries like "What are the side effects?" stay in context
  let contextCondition = condition;
  if (!contextCondition && history.length > 0) {
    for (const msg of [...history].reverse()) {
      const { condition: prevCondition } = extractQueryIntent(msg.content);
      if (prevCondition) {
        contextCondition = prevCondition;
        logger.info(`[RAG] No condition in query — using context condition from history: "${contextCondition}"`);
        break;
      }
    }
  }

  logger.info(`[RAG] Incoming sourceFilter: "${options.sourceFilter}"`);
  const SOURCE_MAP = {
    'pubmed': 'pubmed',
    'openalex': 'openalex',
    'clinicaltrials': 'clinicaltrials',
    'uploaded pdfs': 'pdf',
    'pdf': 'pdf',
  };
  const sourceFilter = options.sourceFilter
    ? SOURCE_MAP[options.sourceFilter.toLowerCase().trim()] || null
    : null;

  const isPdfOnly = sourceFilter === 'pdf';
  logger.info(`[RAG] Resolved sourceFilter: "${sourceFilter}" | isPdfOnly: ${isPdfOnly}`);

  // Step 4: Route query — check cache, live fetch if needed using expanded query (skip web fetch for PDF sources)
  const { freshFetch, fetchedFrom, embedding: queryEmbedding, expandedQuery } = await routeQuery(query, contextCondition, null, disease, isPdfOnly);

  // Step 5: Vector search (after potential live fetch)
  const rawChunks = sourceFilter
    ? await filteredSearch(queryEmbedding, sourceFilter, { topK: 30, minScore: 0.0, filterField: 'source' })
    : await search(queryEmbedding, { topK: 30, minScore: 0.0 });

  logger.info(`[RAG] Retrieved ${rawChunks.length} chunks | freshFetch: ${freshFetch}`);

  // Step 4b: Re-rank by relevance + recency + source credibility
  const rerankedChunks = rerank(rawChunks);

  // Step 4c: Deduplicate — keep best-scoring chunk per unique paper, limit to top 8
  const seenPapers = new Map();
  for (const chunk of rerankedChunks) {
    const key = chunk.paperId || chunk.sourceFile || chunk.title || `unknown_${chunk.chunkIndex}`;
    if (!seenPapers.has(key)) {
      seenPapers.set(key, chunk);
    }
  }
  const dedupedChunks = Array.from(seenPapers.values()).slice(0, 8);
  logger.info(`[RAG] After dedup: ${dedupedChunks.length} unique papers | top score=${dedupedChunks[0]?.rankingScore} source=${dedupedChunks[0]?.source}`);

  // Step 5: Build prompt using promptIntent + condition context + user profile
  const audienceLevel = options.audienceLevel || "patient";
  const preferredTone = options.preferredTone || "educational";
  const { systemPrompt, userMessage } = buildPrompt(promptIntent, query, dedupedChunks, {
    ...options,
    condition: contextCondition,
    intent,
    timeframe,
    audienceLevel,
    preferredTone,
    patientName,   // passed through to personalise the prompt
    location,      // passed through for location-aware trial filtering
  });

  // Step 6: LLM completion with pre-loaded conversation history
  const { content, usage } = await complete(systemPrompt, userMessage, history);

  // Step 7: Parse structured response
  const { structured, data: structuredData } = parseStructuredResponse(content, dedupedChunks);
  logger.info(`[RAG] Response structured: ${structured}`);

  // Step 8: Save conversation turn
  // Use displayText (includes structured fields) if provided, otherwise use query
  const userMessageContent = options.displayText || query;
  await saveMessages(activeSessionId, userMessageContent, content, userId);

  // Step 9: Safety post-check — add disclaimer
  const disclaimerText = getDisclaimer(safetyResult.triggerType);
  const disclaimers = [disclaimerText];

  const processingTimeMs = Date.now() - startTime;
  logger.info(`[RAG] Done in ${processingTimeMs}ms`);

  return {
    intent,
    condition: contextCondition || condition,
    timeframe,
    expandedQuery,
    freshFetch,
    fetchedFrom,
    structured,
    audienceLevel,
    sessionId: activeSessionId,
    ...structuredData,
    disclaimers,
    usage,
  };
};

module.exports = { runRagPipeline };
