const https = require("https");
const logger = require("../utils/logger");

const BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const API_KEY = process.env.PUBMED_API_KEY || "";

const get = (url) =>
  new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("PubMed JSON parse failed")); }
      });
    }).on("error", reject);
  });

// Step 1: search for IDs
const searchIds = async (query, maxResults = 10) => {
  const q = encodeURIComponent(query);
  const key = API_KEY ? `&api_key=${API_KEY}` : "";
  const url = `${BASE_URL}/esearch.fcgi?db=pubmed&term=${q}&retmax=${maxResults}&retmode=json&sort=relevance${key}`;
  const data = await get(url);
  return data?.esearchresult?.idlist || [];
};

// Step 2: fetch details for IDs
const fetchDetails = async (ids) => {
  if (!ids.length) return [];
  const key = API_KEY ? `&api_key=${API_KEY}` : "";
  const url = `${BASE_URL}/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json${key}`;
  const data = await get(url);
  const result = data?.result || {};
  return ids
    .filter((id) => result[id] && !result[id].error)
    .map((id) => {
      const p = result[id];
      const authors = (p.authors || []).map((a) => a.name).filter(Boolean);
      const year = p.pubdate ? parseInt(p.pubdate.slice(0, 4)) : null;
      return {
        paperId: `pubmed_${id}`,
        title: p.title || "Untitled",
        abstract: p.title || "", // esummary doesn't include abstract — use efetch for full abstract
        authors,
        year,
        source: "pubmed",
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      };
    });
};

// Step 3: fetch full abstracts via efetch
const fetchAbstracts = async (ids) => {
  if (!ids.length) return {};
  const key = API_KEY ? `&api_key=${API_KEY}` : "";
  const url = `${BASE_URL}/efetch.fcgi?db=pubmed&id=${ids.join(",")}&rettype=abstract&retmode=xml${key}`;
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let xml = "";
      res.on("data", (chunk) => (xml += chunk));
      res.on("end", () => {
        const abstracts = {};
        const matches = xml.matchAll(/<PMID[^>]*>(\d+)<\/PMID>[\s\S]*?<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g);
        for (const m of matches) {
          abstracts[m[1]] = m[2].replace(/<[^>]+>/g, "").trim();
        }
        resolve(abstracts);
      });
    }).on("error", () => resolve({}));
  });
};

const searchPapers = async (query, maxResults = 10) => {
  logger.info(`[PubMed] Searching: "${query}" (max ${maxResults})`);
  const ids = await searchIds(query, maxResults);
  if (!ids.length) return [];

  const [papers, abstracts] = await Promise.all([fetchDetails(ids), fetchAbstracts(ids)]);

  // merge abstracts
  for (const paper of papers) {
    const rawId = paper.paperId.replace("pubmed_", "");
    if (abstracts[rawId]) paper.abstract = abstracts[rawId];
  }

  logger.info(`[PubMed] Found ${papers.length} papers`);
  return papers;
};

module.exports = { searchPapers };
