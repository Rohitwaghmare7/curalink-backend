const { pipeline, env } = require("@xenova/transformers");
const logger = require("../utils/logger");

// Ensure it downloads from HuggingFace and doesn't get confused by browser caches
env.useBrowserCache = false;

const MODEL_NAME = process.env.HF_EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
const BATCH_SIZE = 20;

let extractorInstance = null;

const getExtractor = async () => {
  if (!extractorInstance) {
    logger.info(`Loading local embedding model: ${MODEL_NAME}`);
    extractorInstance = await pipeline("feature-extraction", MODEL_NAME);
  }
  return extractorInstance;
};

const generateEmbedding = async (text) => {
  try {
    const extractor = await getExtractor();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  } catch (err) {
    logger.error(`Embedding failed: ${err.message}`);
    throw err;
  }
};

const generateBatchEmbeddings = async (texts) => {
  const results = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    logger.info(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1} — ${batch.length} texts`);
    const embeddings = await Promise.all(batch.map((t) => generateEmbedding(t)));
    results.push(...embeddings);
  }
  return results;
};

module.exports = { generateEmbedding, generateBatchEmbeddings };
