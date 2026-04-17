const User = require("../models/User");
const { signToken } = require("../utils/jwt");
const logger = require("../utils/logger");

// ── Signup ─────────────────────────────────────────────────────────────────
const signup = async (req, res, next) => {
  try {
    const { name, email, password, audienceLevel, preferredTone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "name, email, and password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Password must be at least 6 characters.",
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: "CONFLICT",
        message: "An account with this email already exists.",
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      audienceLevel: audienceLevel || "patient",
      preferredTone: preferredTone || "educational",
      authProvider: "local",
    });

    const token = signToken(user._id);
    logger.info(`[Auth] New signup: ${email}`);

    res.status(201).json({
      success: true,
      data: { token, user },
    });
  } catch (err) {
    next(err);
  }
};

// ── Login ──────────────────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "email and password are required.",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        error: "UNAUTHORIZED",
        message: "Invalid email or password.",
      });
    }

    if (user.authProvider === "google") {
      return res.status(400).json({
        success: false,
        error: "WRONG_AUTH_METHOD",
        message: "This account uses Google Sign-In. Please login with Google.",
      });
    }

    const token = signToken(user._id);
    logger.info(`[Auth] Login: ${email}`);

    res.json({
      success: true,
      data: { token, user },
    });
  } catch (err) {
    next(err);
  }
};

// ── Get current user ───────────────────────────────────────────────────────
const getMe = async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
};

// ── Update profile ─────────────────────────────────────────────────────────
const updateProfile = async (req, res, next) => {
  try {
    const { name, audienceLevel, preferredTone } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (audienceLevel) updates.audienceLevel = audienceLevel;
    if (preferredTone) updates.preferredTone = preferredTone;

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true });
    res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
};

// ── Google OAuth callback ──────────────────────────────────────────────────
const googleCallback = (req, res) => {
  const token = signToken(req.user._id);
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  // Redirect to frontend with token in query param
  res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
};

module.exports = { signup, login, getMe, updateProfile, googleCallback };
