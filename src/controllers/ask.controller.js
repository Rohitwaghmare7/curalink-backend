const { runRagPipeline } = require("../pipelines/rag.pipeline");
const reqCache = require("../services/cache.service");
const crypto = require("crypto");
const logger = require("../utils/logger");

const askQuestion = async (req, res, next) => {
  try {
    const {
      query,
      disease,
      additionalQuery,
      patientName,
      location,
      userId,
      options,
      sessionId,
      audienceLevel,
      preferredTone,
      source,
    } = req.body;

    if (!query && !additionalQuery && !disease) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "query is required and must be a non-empty string.",
      });
    }

    // Build the primary query string from structured or natural input
    const primaryQuery = query || additionalQuery || "";

    const pipelineParams = {
      query: primaryQuery.trim(),
      disease: disease?.trim() || null,
      additionalQuery: additionalQuery?.trim() || null,
      patientName: patientName?.trim() || null,
      location: location?.trim() || null,
      userId: req.userId || userId || null,
      options: {
        ...options,
        audienceLevel: audienceLevel || options?.audienceLevel || "patient",
        preferredTone: preferredTone || options?.preferredTone || "educational",
        displayText: req.body.displayText || null,
        sourceFilter: source || null,  // 'pubmed' | 'openalex' | 'clinicaltrials' | 'pdf' | null
      },
      sessionId: sessionId || req.headers['x-request-id'] || 'default', // Fallback to avoid collisions
    };

    // Generate strict Cache Key
    const cacheKeyString = JSON.stringify(pipelineParams);
    const cacheKey = crypto.createHash("sha256").update(cacheKeyString).digest("hex");

    if (reqCache.has(cacheKey)) {
      logger.info(`[CACHE HIT] Returning instantly for key: ${cacheKey.substring(0, 8)}`);
      const cachedResult = reqCache.get(cacheKey);
      return res.json({ success: true, data: cachedResult, _cached: true });
    }

    const result = await runRagPipeline(pipelineParams);

    // Only cache if successful and safe — using 1 hr TTL
    reqCache.set(cacheKey, result);

    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`Ask error: ${err.message}`);
    next(err);
  }
};

module.exports = { askQuestion };
