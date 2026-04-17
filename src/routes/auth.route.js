const express = require("express");
const passport = require("passport");
const { signup, login, getMe, updateProfile, googleCallback } = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");

const router = express.Router();

// ── Email / Password ───────────────────────────────────────────────────────
router.post("/signup", signup);
router.post("/login", login);

// ── Protected ─────────────────────────────────────────────────────────────
router.get("/me", protect, getMe);
router.patch("/me", protect, updateProfile);

// ── Google OAuth ───────────────────────────────────────────────────────────
const googleAuthGuard = (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(501).json({
      success: false,
      error: "NOT_CONFIGURED",
      message: "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env",
    });
  }
  next();
};

router.get(
  "/google",
  googleAuthGuard,
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

router.get(
  "/google/callback",
  googleAuthGuard,
  passport.authenticate("google", { failureRedirect: "/api/auth/google/failed", session: false }),
  googleCallback
);

router.get("/google/failed", (req, res) => {
  res.status(401).json({ success: false, error: "GOOGLE_AUTH_FAILED", message: "Google authentication failed." });
});

module.exports = router;
