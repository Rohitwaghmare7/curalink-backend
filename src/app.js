const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const passport = require("passport");
const rateLimiter = require("./middleware/rateLimiter");
const errorHandler = require("./middleware/errorHandler");
const requestId = require("./middleware/requestId.middleware");
const healthRoute = require("./routes/health.route");
const uploadRoute = require("./routes/upload.route");
const askRoute = require("./routes/ask.route");
const researchRoute = require("./routes/research.route");
const conversationRoute = require("./routes/conversation.route");
const authRoute = require("./routes/auth.route");

// Init passport strategies
require("./config/passport");

const app = express();

// Security & parsing middleware
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
  ],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Passport (no sessions — JWT only)
app.use(passport.initialize());

// Request ID tracing
app.use(requestId);

// Rate limiting
app.use(rateLimiter);

// Routes
app.use("/api/health", healthRoute);
app.use("/api/auth", authRoute);
app.use("/api", uploadRoute);
app.use("/api/ask", askRoute);
app.use("/api/research", researchRoute);
app.use("/api/conversations", conversationRoute);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "NOT_FOUND", message: "Route not found." });
});

// Global error handler
app.use(errorHandler);

module.exports = app;
