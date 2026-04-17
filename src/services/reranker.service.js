/**
 * Re-Ranking Service
 * Composite score = 0.5 * relevance + 0.3 * recency + 0.2 * credibility
 */

const CURRENT_YEAR = new Date().getFullYear();
const OLDEST_YEAR = 2000; // anything older gets minimum recency score

const SOURCE_CREDIBILITY = {
  pubmed: 1.0,
  openalex: 0.85,
  clinicaltrials: 0.75,
  pdf: 0.6,
};

const WEIGHTS = {
  relevance: 0.5,
  recency: 0.3,
  credibility: 0.2,
};

// Normalize year to 0–1 (2000 = 0, current year = 1)
const recencyScore = (year) => {
  if (!year || year <= 0) return 0.3; // unknown year gets neutral score
  const clamped = Math.max(OLDEST_YEAR, Math.min(CURRENT_YEAR, year));
  return (clamped - OLDEST_YEAR) / (CURRENT_YEAR - OLDEST_YEAR);
};

const credibilityScore = (source) => {
  return SOURCE_CREDIBILITY[source] ?? 0.5;
};

const rerank = (chunks) => {
  if (!chunks || chunks.length === 0) return [];

  const scored = chunks.map((chunk) => {
    const relevance = Math.max(0, Math.min(1, chunk.score || 0));
    const recency = recencyScore(chunk.year);
    const credibility = credibilityScore(chunk.source);

    const rankingScore =
      WEIGHTS.relevance * relevance +
      WEIGHTS.recency * recency +
      WEIGHTS.credibility * credibility;

    return {
      ...chunk,
      rankingScore: parseFloat(rankingScore.toFixed(4)),
      rankingBreakdown: {
        relevance: parseFloat(relevance.toFixed(4)),
        recency: parseFloat(recency.toFixed(4)),
        credibility: parseFloat(credibility.toFixed(4)),
      },
    };
  });

  // Sort descending by composite ranking score
  return scored.sort((a, b) => b.rankingScore - a.rankingScore);
};

module.exports = { rerank };
