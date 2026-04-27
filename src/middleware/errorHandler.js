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

  const statusCode = err.statusCode || 500;
  
  // Mask the message for internal server errors to prevent leaking raw database/network logs to UI
  const isInternalError = statusCode === 500;
  const clientMessage = isInternalError
    ? "An unexpected internal error occurred. Please try again later."
    : err.message || "An unexpected error occurred.";

  res.status(statusCode).json({
    success: false,
    error: err.code || "INTERNAL_ERROR",
    message: clientMessage,
  });
};

module.exports = errorHandler;
