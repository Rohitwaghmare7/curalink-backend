const express = require("express");
const { askQuestion } = require("../controllers/ask.controller");
const { optionalAuth } = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { askSchema } = require("../validators/ask.validator");

const router = express.Router();

router.post("/", optionalAuth, validate(askSchema), askQuestion);

module.exports = router;
