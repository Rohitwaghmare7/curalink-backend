const express = require("express");
const { askQuestion } = require("../controllers/ask.controller");
const { optionalAuth } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/", optionalAuth, askQuestion);

module.exports = router;
