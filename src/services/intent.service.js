/**
 * Intent Service — Phase 5 upgrade
 * Extracts: condition, intent type, timeframe, and raw intent category
 * Rule-based — zero API cost, instant
 */

// ── Intent type rules ──────────────────────────────────────────────────────
const INTENT_RULES = [
  {
    intent: "clinical_trials",
    keywords: ["clinical trial", "clinical trials", "\\btrial\\b", "\\btrials\\b", "nct"],
  },
  {
    intent: "researchers",
    keywords: ["researcher", "researchers", "expert", "experts", "scientist", "scientists",
      "who studies", "top researcher", "leading researcher", "author", "authors"],
  },
  {
    intent: "treatment",
    keywords: ["treatment", "treatments", "therapy", "therapies", "cure", "medication",
      "drug", "drugs", "medicine", "manage", "managing", "treat", "treating"],
  },
  {
    intent: "content_generation",
    keywords: ["\\bwrite\\b", "\\bcreate\\b", "\\bgenerate\\b", "\\bdraft\\b", "\\bcompose\\b",
      "\\bproduce\\b", "\\bbuild\\b", "\\bdevelop\\b", "\\bprepare\\b"],
  },
  {
    intent: "format_conversion",
    keywords: ["\\bconvert\\b", "reformat", "simplify", "\\btranslate\\b", "\\brewrite\\b",
      "summarize", "paraphrase", "restructure", "transform"],
  },
  {
    intent: "research",
    keywords: ["research", "\\bstudy\\b", "\\bstudies\\b", "findings", "latest", "recent", "new",
      "advances", "breakthrough", "publication", "paper", "journal"],
  },
  {
    intent: "medical_query",
    keywords: ["symptoms", "causes", "what is", "explain", "how does", "how do",
      "side effects", "risk", "prevention", "diagnosis", "prognosis"],
  },
];

// ── Timeframe extraction ───────────────────────────────────────────────────
const TIMEFRAME_PATTERNS = [
  { pattern: /\b(latest|newest|most recent|current|2024|2025|2026)\b/i, value: "latest" },
  { pattern: /\b(recent|last \d+ years?|past \d+ years?)\b/i, value: "recent" },
  { pattern: /\b(historical|old|early|classic)\b/i, value: "historical" },
];

// ── Medical condition extraction ───────────────────────────────────────────
const CONDITION_PATTERNS = [
  // Cancers
  /\b(lung cancer|breast cancer|prostate cancer|colon cancer|colorectal cancer|skin cancer|melanoma|leukemia|lymphoma|pancreatic cancer|ovarian cancer|cervical cancer|bladder cancer|kidney cancer|liver cancer|brain cancer|stomach cancer|esophageal cancer|thyroid cancer)\b/i,
  // Cardiovascular
  /\b(heart disease|heart attack|cardiac arrest|hypertension|high blood pressure|stroke|atrial fibrillation|heart failure|coronary artery disease|arrhythmia)\b/i,
  // Metabolic
  /\b(diabetes|type 1 diabetes|type 2 diabetes|obesity|metabolic syndrome|insulin resistance|hypoglycemia|hyperglycemia)\b/i,
  // Neurological
  /\b(alzheimer'?s?|parkinson'?s?|multiple sclerosis|epilepsy|dementia|migraine|neuropathy|als|amyotrophic lateral sclerosis)\b/i,
  // Respiratory
  /\b(asthma|copd|chronic obstructive pulmonary disease|pneumonia|tuberculosis|covid|covid-19|influenza|flu)\b/i,
  // Mental health
  /\b(depression|anxiety|bipolar|schizophrenia|ptsd|adhd|autism|eating disorder|ocd)\b/i,
  // Other common
  /\b(hiv|aids|hepatitis|arthritis|osteoporosis|fibromyalgia|lupus|crohn'?s?|ibs|irritable bowel|kidney disease|liver disease)\b/i,
];

const extractCondition = (query) => {
  const lower = query.toLowerCase();
  for (const pattern of CONDITION_PATTERNS) {
    const match = lower.match(pattern);
    if (match) return match[0].toLowerCase();
  }
  return null;
};

const extractTimeframe = (query) => {
  for (const { pattern, value } of TIMEFRAME_PATTERNS) {
    if (pattern.test(query)) return value;
  }
  return null;
};

const detectRawIntent = (query) => {
  const lower = query.toLowerCase();
  for (const rule of INTENT_RULES) {
    for (const keyword of rule.keywords) {
      const pattern = keyword.startsWith("\\b") ? new RegExp(keyword, "i") : new RegExp(`\\b${keyword}\\b`, "i");
      if (pattern.test(lower)) return rule.intent;
    }
  }
  return "general";
};

// Map hackathon intent types to RAG prompt intent types
const INTENT_TO_PROMPT_MAP = {
  clinical_trials: "medical_query",
  researchers: "medical_query",
  treatment: "medical_query",
  research: "medical_query",
  medical_query: "medical_query",
  content_generation: "content_generation",
  format_conversion: "format_conversion",
  general: "general",
};

const extractQueryIntent = (query) => {
  const condition = extractCondition(query);
  const intent = detectRawIntent(query);
  const timeframe = extractTimeframe(query);
  const promptIntent = INTENT_TO_PROMPT_MAP[intent] || "general";

  return {
    condition,
    intent,          // specific: treatment, clinical_trials, researchers, research, etc.
    promptIntent,    // maps to LLM prompt template
    timeframe,       // latest, recent, historical, null
  };
};

// Keep backward-compatible export
const detectIntent = (query) => {
  const { promptIntent } = extractQueryIntent(query);
  return { intent: promptIntent, confidence: "high" };
};

/**
 * Builds an expanded search query by combining the user's query with the disease context.
 * e.g. "deep brain stimulation" + "parkinson's disease" → "deep brain stimulation AND parkinson's disease"
 */
const buildExpandedQuery = (query, disease) => {
  if (!query && !disease) return "";
  if (!disease) return query;
  if (!query) return disease;

  const q = query.trim().toLowerCase();
  const d = disease.trim().toLowerCase();

  // Avoid duplication if disease is already in the query
  if (q.includes(d)) return query.trim();

  return `${query.trim()} AND ${disease.trim()}`;
};

module.exports = { extractQueryIntent, detectIntent, buildExpandedQuery };
