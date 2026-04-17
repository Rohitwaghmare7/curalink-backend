const { runResearchIngestionPipeline } = require("../pipelines/research.ingestion.pipeline");
const ResearchPaper = require("../models/ResearchPaper");
const { getPineconeIndex } = require("../config/pinecone");
const logger = require("../utils/logger");

const ingestResearch = async (req, res, next) => {
  try {
    const { query, sources, maxPerSource } = req.body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "query is required.",
      });
    }

    const result = await runResearchIngestionPipeline({
      query: query.trim(),
      sources: sources || ["pubmed", "openalex"],
      maxPerSource: maxPerSource || 10,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`Research ingest error: ${err.message}`);
    next(err);
  }
};

const listPapers = async (req, res, next) => {
  try {
    const { source, query, limit = 20 } = req.query;
    const filter = { status: "ready" };
    if (source) filter.source = source;
    if (query) filter.query = { $regex: query, $options: "i" };

    const papers = await ResearchPaper.find(filter, { __v: 0 })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, data: { papers, total: papers.length } });
  } catch (err) {
    next(err);
  }
};

const getStats = async (req, res, next) => {
  try {
    const [pubmed, openalex, clinicaltrials, pdf, total] = await Promise.all([
      ResearchPaper.countDocuments({ source: "pubmed", status: "ready" }),
      ResearchPaper.countDocuments({ source: "openalex", status: "ready" }),
      ResearchPaper.countDocuments({ source: "clinicaltrials", status: "ready" }),
      ResearchPaper.countDocuments({ source: "pdf", status: "ready" }),
      ResearchPaper.countDocuments({ status: "ready" }),
    ]);

    // Get Pinecone vector count
    let vectorCount = null;
    try {
      const { getPineconeClient } = require("../config/pinecone");
      const client = getPineconeClient();
      const indexes = await client.listIndexes();
      const idx = indexes.indexes?.find((i) => i.name === process.env.PINECONE_INDEX_NAME);
      vectorCount = idx?.status?.ready ? "index ready" : "unknown";
    } catch { vectorCount = "unavailable"; }

    res.json({
      success: true,
      data: {
        totalPapers: total,
        bySource: { pubmed, openalex, clinicaltrials, pdf },
        vectorStore: vectorCount,
        llmModel: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { ingestResearch, listPapers, getStats };
