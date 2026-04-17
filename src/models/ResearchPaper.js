const mongoose = require("mongoose");

const researchPaperSchema = new mongoose.Schema(
  {
    paperId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    abstract: { type: String, default: "" },
    authors: [{ type: String }],
    year: { type: Number, default: null },
    source: { type: String, enum: ["pubmed", "openalex", "clinicaltrials", "pdf"], required: true },
    url: { type: String, default: "" },
    status: { type: String, enum: ["processing", "ready", "failed"], default: "processing" },
    totalChunks: { type: Number, default: 0 },
    query: { type: String, default: "" },
    snippet: { type: String, default: "" },
    // Clinical trials specific fields
    trialStatus: { type: String, default: "" },
    phase: { type: String, default: "" },
    eligibility: { type: String, default: "" },
    locations: [
      {
        facility: { type: String, default: "" },
        city: { type: String, default: "" },
        country: { type: String, default: "" },
      },
    ],
    contacts: [
      {
        name: { type: String, default: "" },
        phone: { type: String, default: "" },
        email: { type: String, default: "" },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("ResearchPaper", researchPaperSchema);
