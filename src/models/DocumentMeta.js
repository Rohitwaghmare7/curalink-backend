const mongoose = require("mongoose");

const documentMetaSchema = new mongoose.Schema(
  {
    documentId: { type: String, required: true, unique: true },
    sourceFile: { type: String, required: true },
    sourceType: { type: String, enum: ["pdf", "template", "manual"], default: "pdf" },
    category: { type: String, default: "general" },
    tags: [{ type: String }],
    totalChunks: { type: Number, default: 0 },
    totalPages: { type: Number, default: 0 },
    status: { type: String, enum: ["processing", "ready", "failed"], default: "processing" },
    uploadedBy: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DocumentMeta", documentMetaSchema);
