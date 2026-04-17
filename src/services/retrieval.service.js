const { getPineconeIndex } = require("../config/pinecone");
const logger = require("../utils/logger");

const TOP_K = parseInt(process.env.PINECONE_TOP_K) || 30;
const MIN_SCORE = 0.5;

const mapMatch = (m) => ({
  text: m.metadata.text,
  score: m.score,
  sourceFile: m.metadata.sourceFile || m.metadata.title || null,
  title: m.metadata.title || null,
  authors: m.metadata.authors || null,
  year: m.metadata.year || null,
  source: m.metadata.source || null,
  url: m.metadata.url || null,
  snippet: m.metadata.snippet || null,
  chunkIndex: m.metadata.chunkIndex,
  documentId: m.metadata.documentId || null,
  paperId: m.metadata.paperId || null,
  category: m.metadata.category || null,
  // Clinical trial fields
  trialStatus: m.metadata.trialStatus || null,
  phase: m.metadata.phase || null,
  eligibility: m.metadata.eligibility || null,
  locations: m.metadata.locations ? JSON.parse(m.metadata.locations) : [],
  contacts: m.metadata.contacts ? JSON.parse(m.metadata.contacts) : [],
});

const search = async (queryEmbedding, options = {}) => {
  const { topK = TOP_K, minScore = MIN_SCORE } = options;
  try {
    const index = getPineconeIndex();
    const result = await index.query({ vector: queryEmbedding, topK, includeMetadata: true });
    if (!result.matches || result.matches.length === 0) return [];
    return result.matches.filter((m) => m.score >= minScore).map(mapMatch);
  } catch (err) {
    logger.error(`Retrieval search failed: ${err.message}`);
    return [];
  }
};

const filteredSearch = async (queryEmbedding, filterValue, options = {}) => {
  const { topK = TOP_K, minScore = MIN_SCORE, filterField = 'category' } = options;
  try {
    const index = getPineconeIndex();
    const result = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
      filter: { [filterField]: { $eq: filterValue } },
    });
    if (!result.matches || result.matches.length === 0) return [];
    return result.matches.filter((m) => m.score >= minScore).map(mapMatch);
  } catch (err) {
    logger.error(`Filtered retrieval search failed: ${err.message}`);
    return [];
  }
};

module.exports = { search, filteredSearch };
