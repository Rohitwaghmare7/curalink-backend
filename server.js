require("dotenv").config();
const app = require("./src/app");
const connectDB = require("./src/config/db");
const logger = require("./src/utils/logger");
const { generateEmbedding } = require("./src/services/embedding.service");

const PORT = process.env.PORT || 3000;

// Log env vars on startup (no secrets — just keys presence)
logger.info(`NODE_ENV: ${process.env.NODE_ENV}`);
logger.info(`MONGODB_URI set: ${!!process.env.MONGODB_URI}`);
logger.info(`GEMINI_API_KEY set: ${!!process.env.GEMINI_API_KEY}`);
logger.info(`PINECONE_API_KEY set: ${!!process.env.PINECONE_API_KEY}`);

const start = async () => {
  await connectDB();
  app.listen(PORT, async () => {
    logger.info(`Server running on port ${PORT}`);
    // Pre-warm embedding model so the first user query is not slow
    try {
      await generateEmbedding("warmup");
      logger.info("[Warmup] Embedding model ready.");
    } catch (err) {
      logger.warn(`[Warmup] Embedding model pre-load failed: ${err.message}`);
    }
  });
};

start();
