const { searchPapers: pubmedSearch } = require("../services/pubmed.service");
const { searchPapers: openalexSearch } = require("../services/openalex.service");
const { searchTrials } = require("../services/clinicaltrials.service");
const { chunkText } = require("../utils/chunker");
const { generateBatchEmbeddings } = require("../services/embedding.service");
const { getPineconeIndex } = require("../config/pinecone");
const ResearchPaper = require("../models/ResearchPaper");
const logger = require("../utils/logger");

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE_TOKENS) || 500;
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP_TOKENS) || 50;
const PINECONE_BATCH = 100;
const INTER_PAPER_DELAY_MS = 0; // removed entirely — no external API rate limits with local HuggingFace

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SOURCE_FETCHERS = {
  pubmed: (query, max) => pubmedSearch(query, max),
  openalex: (query, max) => openalexSearch(query, max),
  clinicaltrials: (query, max) => searchTrials(query, max),
};

const runResearchIngestionPipeline = async ({
  query,
  sources = ["pubmed", "openalex"],
  maxPerSource = 10,
}) => {
  const startTime = Date.now();
  logger.info(`[ResearchIngestion] Query: "${query}" | Sources: ${sources.join(", ")}`);

  const results = { ingested: [], skipped: [], failed: [] };

  // Step 1: Fetch from all requested sources in parallel
  const fetchPromises = sources
    .filter((s) => SOURCE_FETCHERS[s])
    .map((s) => SOURCE_FETCHERS[s](query, maxPerSource).catch((err) => {
      logger.error(`[ResearchIngestion] ${s} fetch failed: ${err.message}`);
      return [];
    }));

  const fetched = (await Promise.all(fetchPromises)).flat();
  logger.info(`[ResearchIngestion] Total fetched: ${fetched.length} papers`);

  // Step 2: Process each paper
  for (const paper of fetched) {
    try {
      // Skip if already ingested
      const exists = await ResearchPaper.findOne({ paperId: paper.paperId });
      if (exists) {
        results.skipped.push(paper.paperId);
        continue;
      }

      const text = [paper.title, paper.abstract].filter(Boolean).join("\n\n");
      if (!text.trim()) {
        results.skipped.push(paper.paperId);
        continue;
      }

      // Step 3: Chunk
      const chunks = chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP);

      // Step 4: Embed
      const embeddings = await generateBatchEmbeddings(chunks.map((c) => c.text));

      // Step 5: Upsert to Pinecone
      const index = getPineconeIndex();

      // Build snippet from first 300 chars of abstract
      const snippet = paper.abstract ? paper.abstract.slice(0, 300).trim() : "";

      for (let i = 0; i < chunks.length; i += PINECONE_BATCH) {
        const batch = chunks.slice(i, i + PINECONE_BATCH);
        const records = batch.map((chunk, j) => ({
          id: `${paper.paperId}_chunk_${chunk.chunkIndex}`,
          values: embeddings[i + j],
          metadata: {
            paperId: paper.paperId,
            title: paper.title,
            authors: (paper.authors || []).join(", "),
            year: paper.year || 0,
            source: paper.source,
            url: paper.url || "",
            snippet,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            query,
            // Clinical trial specific — stored as JSON strings (Pinecone metadata is flat)
            trialStatus: paper.status || "",
            phase: paper.phase || "",
            eligibility: paper.eligibility ? paper.eligibility.slice(0, 500) : "",
            locations: paper.locations ? JSON.stringify(paper.locations) : "[]",
            contacts: paper.contacts ? JSON.stringify(paper.contacts) : "[]",
          },
        }));
        await index.upsert({ records });
      }

      // Step 6: Save to MongoDB
      await ResearchPaper.create({
        ...paper,
        query,
        snippet: paper.abstract ? paper.abstract.slice(0, 300).trim() : "",
        trialStatus: paper.status || "",
        totalChunks: chunks.length,
        status: "ready",
      });

      results.ingested.push(paper.paperId);
      logger.info(`[ResearchIngestion] Ingested: ${paper.title.slice(0, 60)}`);
      await sleep(INTER_PAPER_DELAY_MS); // rate limit buffer
    } catch (err) {
      logger.error(`[ResearchIngestion] Failed ${paper.paperId}: ${err.message}`);
      results.failed.push(paper.paperId);
      await ResearchPaper.findOneAndUpdate(
        { paperId: paper.paperId },
        { status: "failed" },
        { upsert: true }
      );
    }
  }

  const processingTimeMs = Date.now() - startTime;
  logger.info(`[ResearchIngestion] Done in ${processingTimeMs}ms — ingested: ${results.ingested.length}, skipped: ${results.skipped.length}, failed: ${results.failed.length}`);

  return {
    query,
    sources,
    ingested: results.ingested.length,
    skipped: results.skipped.length,
    failed: results.failed.length,
    processingTimeMs,
  };
};

module.exports = { runResearchIngestionPipeline };
