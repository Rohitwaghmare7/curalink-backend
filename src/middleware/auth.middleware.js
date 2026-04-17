const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");
const logger = require("../utils/logger");

// Protect routes — requires valid JWT
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "UNAUTHORIZED",
        message: "No token provided. Use: Authorization: Bearer <token>",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "UNAUTHORIZED",
        message: "User no longer exists.",
      });
    }

    req.user = user;
    req.userId = user._id.toString();
    next();
  } catch (err) {
    logger.warn(`Auth failed: ${err.message}`);
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "Invalid or expired token.",
    });
  }
};

// Optional auth — attaches user if token present, continues if not
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) return next();

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id);
    if (user) {
      req.user = user;
      req.userId = user._id.toString();
    }
  } catch {
    // ignore — optional auth
  }
  next();
};

module.exports = { protect, optionalAuth };
