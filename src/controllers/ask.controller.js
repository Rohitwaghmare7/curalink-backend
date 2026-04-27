const { runRagPipeline } = require("../pipelines/rag.pipeline");
const reqCache = require("../services/cache.service");
const crypto = require("crypto");
const logger = require("../utils/logger");

const askQuestion = async (req, res, next) => {
  try {
    logger.info(`[INCOMING] Request Body: ${JSON.stringify(req.body)}`);
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

    // Build clean cache params (excluding volatile sessionId/requestId)
    const cacheParams = {
      query: primaryQuery.trim(),
      disease: disease?.trim() || null,
      additionalQuery: additionalQuery?.trim() || null,
      patientName: patientName?.trim() || null,
      location: location?.trim() || null,
      userId: req.userId || userId || null,
      options: {
        audienceLevel: audienceLevel || options?.audienceLevel || "patient",
        preferredTone: preferredTone || options?.preferredTone || "educational",
        sourceFilter: source || null,
        stream: !!(options?.stream === true),
      }
    };

    const cacheKey = crypto.createHash("sha256").update(JSON.stringify(cacheParams)).digest("hex");

    if (reqCache.has(cacheKey)) {
      logger.info(`[CACHE HIT] Returning instantly for key: ${cacheKey.substring(0, 8)}`);
      const cachedResult = reqCache.get(cacheKey);
      
      const isStreaming = options?.stream === true;
      if (isStreaming) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: cachedResult.condition })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', ...cachedResult, _cached: true })}\n\n`);
        return res.end();
      }
      return res.json({ success: true, data: cachedResult, _cached: true });
    }

    const pipelineParams = {
      ...cacheParams,
      options: {
        ...cacheParams.options,
        displayText: req.body.displayText || null,
      },
      sessionId: sessionId || req.headers['x-request-id'] || 'default',
    };

    const isStreaming = cacheParams.options.stream;

    if (isStreaming) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      pipelineParams.options.onProgress = (chunk) => {
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
      };
    }

    const result = await runRagPipeline(pipelineParams);

    // Only cache if successful and safe — using 1 hr TTL
    reqCache.set(cacheKey, result);

    if (isStreaming) {
      res.write(`data: ${JSON.stringify({ type: 'done', ...result })}\n\n`);
      return res.end();
    }

    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`Ask error: ${err.message}`);
    next(err);
  }
};

module.exports = { askQuestion };
