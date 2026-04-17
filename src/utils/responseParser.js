const logger = require("../utils/logger");

/**
 * Extracts and parses JSON from LLM output.
 * Handles:
 *  - Markdown code fences (```json ... ``` or ``` ... ```)
 *  - Truncated JSON (LLM hit token limit mid-response)
 *  - Raw JSON without fences
 */
const extractJSON = (raw) => {
  if (!raw || typeof raw !== "string") return null;

  let candidate = raw.trim();

  // 1. Strip opening fence (```json or ```)
  candidate = candidate.replace(/^```(?:json)?\s*/im, "");

  // 2. Strip closing fence if present (may be missing if truncated)
  candidate = candidate.replace(/\s*```\s*$/m, "");

  candidate = candidate.trim();

  // 3. Find the first { to start of JSON object
  const start = candidate.indexOf("{");
  if (start === -1) return null;
  candidate = candidate.slice(start);

  // 4. Find the last complete } — handles truncated responses
  const end = candidate.lastIndexOf("}");
  if (end === -1) return null;

  const jsonStr = candidate.slice(0, end + 1);

  try {
    return JSON.parse(jsonStr);
  } catch {
    // JSON.parse failed — try to fix common truncation issues
    // (unclosed arrays/objects at the end)
    try {
      // Count unclosed brackets and close them
      let fixed = jsonStr;
      const opens = (fixed.match(/\[/g) || []).length;
      const closes = (fixed.match(/\]/g) || []).length;
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;

      // Remove trailing incomplete value (e.g. "snippet": "The purpose of this study is to find out wh)
      // by trimming to the last complete key-value pair
      fixed = fixed.replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/, ""); // trailing incomplete string value
      fixed = fixed.replace(/,\s*"[^"]*"\s*:\s*\[[^\]]*$/, ""); // trailing incomplete array

      // Close any unclosed arrays
      for (let i = 0; i < opens - closes; i++) fixed += "]";
      // Close any unclosed objects
      for (let i = 0; i < openBraces - closeBraces; i++) fixed += "}";

      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
};

const mapSource = (s) => ({
  title: s.title || s.sourceFile,
  authors: Array.isArray(s.authors) ? s.authors : s.authors ? [s.authors] : [],
  year: s.year,
  platform: s.source,
  url: s.url,
  snippet: s.snippet || (s.text ? s.text.slice(0, 300) : ""),
  // Ranking data — passed through so frontend can show "Why ranked #1?"
  rankingScore: s.rankingScore || null,
  rankingBreakdown: s.rankingBreakdown || null,
  // Clinical trial fields
  ...(s.source === "clinicaltrials" && {
    trialStatus: s.trialStatus || "",
    phase: s.phase || "",
    eligibility: s.eligibility || "",
    locations: s.locations || [],
    contacts: s.contacts || [],
  }),
});

const parseStructuredResponse = (rawLLMOutput, sources = []) => {
  const parsed = extractJSON(rawLLMOutput);

  if (parsed && parsed.conditionOverview) {
    if (!parsed.sources || parsed.sources.length === 0) {
      parsed.sources = sources.map(mapSource);
    } else {
      // Merge ranking data from dedupedChunks into LLM-generated sources by matching title/URL
      parsed.sources = parsed.sources.map((llmSource, i) => {
        const match = sources.find((chunk) =>
          (llmSource.url && chunk.url && llmSource.url === chunk.url) ||
          (llmSource.title && chunk.title && llmSource.title.toLowerCase().includes(chunk.title.toLowerCase().slice(0, 30)))
        ) || sources[i]; // fallback: use positional match

        return {
          ...llmSource,
          platform: llmSource.platform || llmSource.source || match?.source || 'unknown',
          snippet: llmSource.snippet || match?.snippet || '',
          rankingScore: match?.rankingScore || null,
          rankingBreakdown: match?.rankingBreakdown || null,
        };
      });
    }
    return { structured: true, data: parsed };
  }

  logger.warn("[ResponseParser] LLM did not return valid JSON — using fallback");
  return {
    structured: false,
    data: {
      conditionOverview: rawLLMOutput,
      researchInsights: [],
      clinicalTrials: [],
      experts: [],
      sources: sources.map(mapSource),
    },
  };
};

module.exports = { parseStructuredResponse };
