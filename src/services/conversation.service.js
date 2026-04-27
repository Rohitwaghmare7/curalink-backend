const { v4: uuidv4 } = require("uuid");
const Conversation = require("../models/Conversation");

const MAX_HISTORY = parseInt(process.env.MAX_CONVERSATION_HISTORY) || 4;

const createSession = () => uuidv4();

const getHistory = async (sessionId, lastN = MAX_HISTORY) => {
  const conv = await Conversation.findOne({ sessionId });
  if (!conv) return [];
  // Return last N messages as { role, content } pairs
  return conv.messages.slice(-lastN * 2).map((m) => ({
    role: m.role,
    content: m.content,
  }));
};

const saveMessages = async (sessionId, userMessage, assistantContent, userId = null) => {
  const setOnInsertData = { sessionId, userId };
  if (!userId) {
    // Guest session — expires in 24 hours (86400 seconds)
    setOnInsertData.expiresAt = new Date(Date.now() + 86400 * 1000);
  }

  await Conversation.findOneAndUpdate(
    { sessionId },
    {
      $setOnInsert: setOnInsertData,
      $push: {
        messages: {
          $each: [
            { role: "user", content: userMessage },
            { role: "assistant", content: assistantContent },
          ],
          $slice: -200,
        },
      },
    },
    { upsert: true, new: true }
  );
};

const getConversation = async (sessionId) => {
  return Conversation.findOne({ sessionId }, { __v: 0 });
};

module.exports = { createSession, getHistory, saveMessages, getConversation };
