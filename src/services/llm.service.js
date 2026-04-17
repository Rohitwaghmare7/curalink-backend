const { getGroqClient } = require("../config/groq");
const logger = require("../utils/logger");

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const MAX_TOKENS = parseInt(process.env.GEMINI_MAX_TOKENS) || 1500;
const TEMPERATURE = parseFloat(process.env.GEMINI_TEMPERATURE) || 0.3;
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const complete = async (systemPrompt, userMessage, history = [], retries = 0) => {
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
    });

    const content = response.choices[0].message.content;
    const usage = {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
    };

    logger.info(`LLM usage — prompt: ${usage.promptTokens}, completion: ${usage.completionTokens}`);
    return { content, usage };
  } catch (err) {
    const isRetryable = err.status === 429 || err.status === 500 || err.status === 502 || err.status === 503;
    if (isRetryable && retries < MAX_RETRIES) {
      const delay = Math.min(3000 * Math.pow(2, retries), 15000);
      logger.warn(`LLM retry ${retries + 1}/${MAX_RETRIES} after ${delay}ms — ${err.message}`);
      await sleep(delay);
      return complete(systemPrompt, userMessage, history, retries + 1);
    }
    logger.error(`LLM failed: ${err.message}`);
    throw err;
  }
};

module.exports = { complete };
