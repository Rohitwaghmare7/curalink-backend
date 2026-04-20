require("dotenv").config();
const { Pinecone } = require("@pinecone-database/pinecone");

async function checkDiabetesRecords() {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const index = pc.index(process.env.PINECONE_INDEX_NAME);
  
  // Query for "Diabetes" to see what we get
  const { generateEmbedding } = require("../src/services/embedding.service");
  const embedding = await generateEmbedding("Diabetes");
  
  const results = await index.query({ 
    vector: embedding, 
    topK: 5, 
    includeMetadata: true 
  });
  
  console.log(JSON.stringify(results, null, 2));
}

checkDiabetesRecords().catch(console.error);
