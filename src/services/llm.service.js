const { getGroqClient } = require("../config/groq");
const { OpenAI } = require("openai");
const logger = require("../utils/logger");

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const MAX_TOKENS = parseInt(process.env.GEMINI_MAX_TOKENS) || 1500;
const TEMPERATURE = parseFloat(process.env.GEMINI_TEMPERATURE) || 0.3;
const MAX_RETRIES = 3;

// Initialize Gemini client as fallback
const geminiClient = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/"
});
const GEMINI_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-2.0-flash";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const complete = async (systemPrompt, userMessage, history = [], retries = 0, stream = false) => {
  try {
    const client = getGroqClient();
    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userMessage },
    ];

    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      stream,
    });

    if (stream) return response;

    const content = response.choices[0].message.content;
    const usage = {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
    };

    logger.info(`LLM usage (Groq) — prompt: ${usage.promptTokens}, completion: ${usage.completionTokens}`);
    return { content, usage };
  } catch (err) {
    const isRetryable = err.status === 429 || err.status === 500 || err.status === 502 || err.status === 503;
    if (isRetryable && retries < MAX_RETRIES) {
      const delay = Math.min(3000 * Math.pow(2, retries), 15000);
      logger.warn(`LLM retry ${retries + 1}/${MAX_RETRIES} after ${delay}ms — ${err.message}`);
      await sleep(delay);
      return complete(systemPrompt, userMessage, history, retries + 1, stream);
    }
    
    logger.error(`Groq LLM failed: ${err.message}. Falling back to Gemini...`);
    
    // Fallback to Gemini
    try {
      const messages = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userMessage },
      ];
      
      const response = await geminiClient.chat.completions.create({
        model: GEMINI_MODEL,
        messages,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        stream,
      });
      
      if (stream) return response;

      const content = response.choices[0].message.content;
      const usage = {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
      };

      logger.info(`LLM usage (Gemini fallback) — prompt: ${usage.promptTokens}, completion: ${usage.completionTokens}`);
      return { content, usage };
    } catch (fallbackErr) {
      logger.error(`Gemini fallback also failed: ${fallbackErr.message}`);
      throw fallbackErr;
    }
  }
};

module.exports = { complete };
