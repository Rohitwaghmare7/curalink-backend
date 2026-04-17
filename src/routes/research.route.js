const express = require("express");
const { ingestResearch, listPapers, getStats } = require("../controllers/research.controller");

const router = express.Router();

router.post("/ingest", ingestResearch);
router.get("/papers", listPapers);
router.get("/stats", getStats);

module.exports = router;
