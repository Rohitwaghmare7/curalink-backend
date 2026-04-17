const OpenAI = require("openai");

let groqClient = null;

const getGroqClient = () => {
  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return groqClient;
};

module.exports = { getGroqClient };
