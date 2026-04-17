const { PDFParse } = require("pdf-parse");
const { v4: uuidv4 } = require("uuid");
const { chunkText } = require("../utils/chunker");
const { generateBatchEmbeddings } = require("../services/embedding.service");
const { getPineconeIndex } = require("../config/pinecone");
const DocumentMeta = require("../models/DocumentMeta");
const logger = require("../utils/logger");

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE_TOKENS) || 500;
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP_TOKENS) || 50;
const PINECONE_BATCH = 100; // max vectors per upsert

const runIngestionPipeline = async ({ fileBuffer, originalName, category = "general", tags = [], uploadedBy = null }) => {
  const startTime = Date.now();
  const documentId = `doc_${uuidv4().replace(/-/g, "").slice(0, 12)}`;

  logger.info(`[Ingestion] Starting — ${originalName} (${documentId})`);

  // Step 1: Extract text from PDF
  const parser = new PDFParse({ data: fileBuffer, verbosity: 0 });
  const parsed = await parser.getText();
  const rawText = parsed.text;
  const totalPages = parsed.total;
  logger.info(`[Ingestion] Extracted ${rawText.length} chars from ${totalPages} pages`);

  // Step 2: Chunk text
  const chunks = chunkText(rawText, CHUNK_SIZE, CHUNK_OVERLAP);
  logger.info(`[Ingestion] Created ${chunks.length} chunks`);

  // Step 3: Generate embeddings in batches
  const texts = chunks.map((c) => c.text);
  const embeddings = await generateBatchEmbeddings(texts);

  // Step 4: Upsert vectors to Pinecone in batches
  const index = getPineconeIndex();
  for (let i = 0; i < chunks.length; i += PINECONE_BATCH) {
    const batch = chunks.slice(i, i + PINECONE_BATCH);
    const records = batch.map((chunk, j) => ({
      id: `${documentId}_chunk_${chunk.chunkIndex}`,
      values: embeddings[i + j],
      metadata: {
        documentId,
        sourceFile: originalName,
        source: "pdf",
        category,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        pageNumber: 0, // pdf-parse doesn't give per-chunk page numbers easily
      },
    }));
    await index.upsert({ records });
    logger.info(`[Ingestion] Upserted vectors ${i + 1}–${i + batch.length}`);
  }

  // Step 5: Save metadata to MongoDB
  await DocumentMeta.create({
    documentId,
    sourceFile: originalName,
    sourceType: "pdf",
    category,
    tags,
    totalChunks: chunks.length,
    totalPages,
    status: "ready",
    uploadedBy,
  });

  const processingTimeMs = Date.now() - startTime;
  logger.info(`[Ingestion] Done in ${processingTimeMs}ms`);

  return { documentId, sourceFile: originalName, chunksCreated: chunks.length, category, processingTimeMs };
};

module.exports = { runIngestionPipeline };
