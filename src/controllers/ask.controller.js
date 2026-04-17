const { runRagPipeline } = require("../pipelines/rag.pipeline");
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

    const result = await runRagPipeline({
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
      sessionId,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`Ask error: ${err.message}`);
    next(err);
  }
};

module.exports = { askQuestion };
