const https = require("https");
const logger = require("../utils/logger");

const BASE_URL = "https://api.openalex.org/works";
const EMAIL = process.env.OPENALEX_EMAIL || "contact@curalink.ai"; // polite pool

const get = (url) =>
  new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": `Curalink/1.0 (mailto:${EMAIL})` } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("OpenAlex JSON parse failed")); }
      });
    }).on("error", reject);
  });

const searchPapers = async (query, maxResults = 10) => {
  logger.info(`[OpenAlex] Searching: "${query}" (max ${maxResults})`);
  const q = encodeURIComponent(query);
  const url = `${BASE_URL}?search=${q}&per-page=${maxResults}&sort=relevance_score:desc&filter=has_abstract:true&mailto=${EMAIL}`;

  const data = await get(url);
  const works = data?.results || [];

  const papers = works.map((w) => {
    const authors = (w.authorships || [])
      .map((a) => a.author?.display_name)
      .filter(Boolean)
      .slice(0, 5);

    const year = w.publication_year || null;
    const abstract = w.abstract_inverted_index
      ? reconstructAbstract(w.abstract_inverted_index)
      : "";

    return {
      paperId: `openalex_${w.id?.replace("https://openalex.org/", "") || Date.now()}`,
      title: w.title || "Untitled",
      abstract,
      authors,
      year,
      source: "openalex",
      url: w.doi ? `https://doi.org/${w.doi}` : w.id || "",
    };
  });

  logger.info(`[OpenAlex] Found ${papers.length} papers`);
  return papers;
};

// OpenAlex stores abstracts as inverted index — reconstruct to plain text
const reconstructAbstract = (invertedIndex) => {
  if (!invertedIndex) return "";
  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) words[pos] = word;
  }
  return words.filter(Boolean).join(" ");
};

module.exports = { searchPapers };
