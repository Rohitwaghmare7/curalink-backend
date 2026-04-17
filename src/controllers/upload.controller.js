const { runIngestionPipeline } = require("../pipelines/ingestion.pipeline");
const DocumentMeta = require("../models/DocumentMeta");
const { getPineconeIndex } = require("../config/pinecone");
const logger = require("../utils/logger");

const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "INVALID_FILE_TYPE", message: "Only PDF files are accepted." });
    }

    const category = req.body.category || "general";
    const tags = req.body.tags ? req.body.tags.split(",").map((t) => t.trim()) : [];

    const result = await runIngestionPipeline({
      fileBuffer: req.file.buffer,
      originalName: req.file.originalname,
      category,
      tags,
      uploadedBy: req.body.userId || null,
    });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    logger.error(`Upload error: ${err.message}`);
    next(err);
  }
};

const listDocuments = async (req, res, next) => {
  try {
    const docs = await DocumentMeta.find({}, { __v: 0 }).sort({ createdAt: -1 });
    res.json({
      success: true,
      data: { documents: docs, total: docs.length },
    });
  } catch (err) {
    next(err);
  }
};

const deleteDocument = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const doc = await DocumentMeta.findOne({ documentId });

    if (!doc) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Document not found." });
    }

    // Delete all vectors from Pinecone by prefix
    const index = getPineconeIndex();
    const vectorIds = Array.from({ length: doc.totalChunks }, (_, i) => `${documentId}_chunk_${i}`);
    await index.deleteMany(vectorIds);

    await DocumentMeta.deleteOne({ documentId });

    res.json({
      success: true,
      data: { deletedVectors: doc.totalChunks, message: "Document removed from vector store and metadata store." },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { uploadDocument, listDocuments, deleteDocument };
