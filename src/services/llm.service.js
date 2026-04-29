const { getGroqClient } = require("../config/groq");
const { OpenAI } = require("openai");
const logger = require("../utils/logger");

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const MAX_TOKENS = parseInt(process.env.GEMINI_MAX_TOKENS) || 1500;
const TEMPERATURE = parseFloat(process.env.GEMINI_TEMPERATURE) || 0.3;
const MAX_RETRIES = 3;

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/";

// ── Gemini fallback chain (ordered by highest free-tier quota first) ─────────
// Each model has its own independent daily quota (RPD) on the free tier.
// Source: Google AI Studio free tier limits (as of early 2026)
//
//  Model                  RPD     RPM
//  gemini-2.5-flash-lite  1,000   15   ← most generous, try first
//  gemini-2.5-flash         250   10
//  gemini-2.5-pro           100    5   ← last resort
//
const GEMINI_FALLBACK_CHAIN = [
  process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash-lite", // 1000 RPD
  "gemini-2.5-flash",                                        //  250 RPD
  "gemini-2.5-pro",                                          //  100 RPD
].filter((v, i, a) => a.indexOf(v) === i); // deduplicate in case env overrides one of these

const geminiClient = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: GEMINI_BASE_URL,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Try Groq first. If it fails (rate-limit or error), walk down
 * the Gemini model chain until one succeeds.
 */
const complete = async (systemPrompt, userMessage, history = [], retries = 0, stream = false) => {
  const cleanHistory = history.map(({ role, content }) => ({ role, content }));
  const messages = [
    { role: "system", content: systemPrompt },
    ...cleanHistory,
    { role: "user", content: userMessage },
  ];

  // ── Primary: Groq (LLaMA 3.3 70B) ──────────────────────────────────────────
  try {
    const client = getGroqClient();
    const response = await client.chat.completions.create({
      model: GROQ_MODEL,
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
    logger.info(`LLM usage (Groq/${GROQ_MODEL}) — prompt: ${usage.promptTokens}, completion: ${usage.completionTokens}`);
    return { content, usage };
  } catch (err) {
    const isRetryable = err.status === 429 || err.status === 500 || err.status === 502 || err.status === 503;
    if (isRetryable && retries < MAX_RETRIES) {
      const delay = Math.min(3000 * Math.pow(2, retries), 15000);
      logger.warn(`LLM retry ${retries + 1}/${MAX_RETRIES} after ${delay}ms — ${err.message}`);
      await sleep(delay);
      return complete(systemPrompt, userMessage, history, retries + 1, stream);
    }
    logger.error(`Groq failed after retries: ${err.message}. Trying Gemini fallback chain...`);
  }

  // ── Fallback chain: try each Gemini model in order ─────────────────────────
  for (const model of GEMINI_FALLBACK_CHAIN) {
    try {
      logger.info(`[LLM Fallback] Trying Gemini model: ${model}`);
      const response = await geminiClient.chat.completions.create({
        model,
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
      logger.info(`LLM usage (Gemini/${model}) — prompt: ${usage.promptTokens}, completion: ${usage.completionTokens}`);
      return { content, usage };
    } catch (err) {
      if (err.status === 429) {
        logger.warn(`[LLM Fallback] ${model} rate-limited (429). Trying next model...`);
      } else {
        logger.error(`[LLM Fallback] ${model} failed: ${err.message}. Trying next model...`);
      }
    }
  }

  // ── All models exhausted ────────────────────────────────────────────────────
  logger.error("[LLM Fallback] All models exhausted — Groq + all Gemini fallbacks failed.");
  const allExhaustedErr = new Error("All LLM providers are currently unavailable. Please try again later.");
  allExhaustedErr.status = 429;
  throw allExhaustedErr;
};

module.exports = { complete };
