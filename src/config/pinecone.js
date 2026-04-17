const { Pinecone } = require("@pinecone-database/pinecone");
const logger = require("../utils/logger");

let pineconeClient = null;

const getPineconeClient = () => {
  if (!pineconeClient) {
    pineconeClient = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    logger.info("Pinecone client initialized");
  }
  return pineconeClient;
};

const getPineconeIndex = () => {
  const client = getPineconeClient();
  return client.index(process.env.PINECONE_INDEX_NAME || "health-copilot");
};

module.exports = { getPineconeClient, getPineconeIndex };
