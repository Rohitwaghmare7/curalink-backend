const rateLimit = require("express-rate-limit");

// Global rate limiter (less strict)
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests, please try again later.",
  },
});

// Stricter rate limiter for the expensive RAG/LLM endpoint
const askLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "RATE_LIMIT_EXCEEDED",
    message: "You have reached the limit of queries for now. Please try again in a few minutes.",
  },
});

module.exports = { globalLimiter, askLimiter };
