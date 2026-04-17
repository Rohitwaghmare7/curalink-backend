const { GoogleGenAI } = require("@google/genai");
const logger = require("../utils/logger");

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";
const BATCH_SIZE = 20;
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let genAI = null;
const getGenAI = () => {
  if (!genAI) genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return genAI;
};

const generateEmbedding = async (text, retries = 0) => {
  try {
    const ai = getGenAI();
    const result = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: 768 },
    });
    return result.embeddings[0].values;
  } catch (err) {
    const isRetryable = err.status === 429 || err.status === 500 || err.status === 502 || err.status === 503;
    if (isRetryable && retries < MAX_RETRIES) {
      const delay = Math.min(5000 * Math.pow(2, retries), 30000); // longer backoff for embeddings
      logger.warn(`Embedding retry ${retries + 1}/${MAX_RETRIES} after ${delay}ms — ${err.message}`);
      await sleep(delay);
      return generateEmbedding(text, retries + 1);
    }
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
