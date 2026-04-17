/**
 * Pre-loads data for all 4 hackathon demo queries
 * Run once before the demo: npm run preload-demo
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { runResearchIngestionPipeline } = require("../src/pipelines/research.ingestion.pipeline");
const logger = require("../src/utils/logger");

const DEMO_QUERIES = [
  { query: "lung cancer treatment", label: "Latest treatment for lung cancer" },
  { query: "diabetes clinical trials", label: "Clinical trials for diabetes" },
  { query: "alzheimer's disease research", label: "Top researchers in Alzheimer's disease" },
  { query: "heart disease studies", label: "Recent studies on heart disease" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
  logger.info("Connected to MongoDB");

  for (const { query, label } of DEMO_QUERIES) {
    logger.info(`\nPre-loading: "${label}"`);
    try {
      const result = await runResearchIngestionPipeline({
        query,
        sources: ["pubmed", "openalex", "clinicaltrials"],
        maxPerSource: 5,
      });
      logger.info(`Done — ingested: ${result.ingested}, skipped: ${result.skipped}`);
    } catch (err) {
      logger.error(`Failed for "${label}": ${err.message}`);
    }
    // Wait between queries to avoid rate limits
    logger.info("Waiting 30s before next query...");
    await sleep(30000);
  }

  logger.info("\n✅ Demo data pre-loaded for all 4 queries.");
  await mongoose.disconnect();
};

run().catch((err) => {
  logger.error(`Preload failed: ${err.message}`);
  process.exit(1);
});
