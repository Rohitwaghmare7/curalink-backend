const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  logger.error({ message: err.message, stack: err.stack, path: req.path });

  if (err.code === "SAFETY_BLOCK") {
    return res.status(403).json({
      success: false,
      error: "SAFETY_BLOCK",
      triggerType: err.triggerType,
      message: err.message,
      emergencyResource: err.emergencyResource || null,
    });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    error: err.code || "INTERNAL_ERROR",
    message: err.message || "An unexpected error occurred.",
  });
};

module.exports = errorHandler;
