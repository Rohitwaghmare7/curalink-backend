require("dotenv").config();
const { Pinecone } = require("@pinecone-database/pinecone");

async function checkStats() {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const index = pc.index(process.env.PINECONE_INDEX_NAME);
  const stats = await index.describeIndexStats();
  console.log(JSON.stringify(stats, null, 2));
}

checkStats().catch(console.error);
