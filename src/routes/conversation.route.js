const express = require("express");
const { getConversation } = require("../services/conversation.service");
const { protect, optionalAuth } = require("../middleware/auth.middleware");
const Conversation = require("../models/Conversation");

const router = express.Router();

// Get all conversations for logged-in user
router.get("/", protect, async (req, res, next) => {
  try {
    const conversations = await Conversation.find(
      { userId: req.userId },
      { sessionId: 1, createdAt: 1, updatedAt: 1, "messages": { $slice: 1 } }  // first msg = user query = title
    ).sort({ updatedAt: -1 }).limit(50);

    res.json({ success: true, data: { conversations, total: conversations.length } });
  } catch (err) {
    next(err);
  }
});

// Get single conversation by sessionId
router.get("/:sessionId", optionalAuth, async (req, res, next) => {
  try {
    const conv = await getConversation(req.params.sessionId);
    if (!conv) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Session not found." });
    }
    res.json({ success: true, data: conv });
  } catch (err) {
    next(err);
  }
});

// Delete a conversation
router.delete("/:sessionId", protect, async (req, res, next) => {
  try {
    const conv = await Conversation.findOneAndDelete({
      sessionId: req.params.sessionId,
      userId: req.userId,
    });
    if (!conv) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Session not found." });
    }
    res.json({ success: true, data: { message: "Conversation deleted." } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
