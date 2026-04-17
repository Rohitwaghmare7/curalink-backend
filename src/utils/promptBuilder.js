const CHARS_PER_TOKEN = 4;
const CONTEXT_MAX_TOKENS = parseInt(process.env.CONTEXT_MAX_TOKENS) || 3000;
const CONTEXT_MAX_CHARS = CONTEXT_MAX_TOKENS * CHARS_PER_TOKEN;

const JSON_SCHEMA = `{
  "conditionOverview": "A clear, plain-language explanation of the condition or topic",
  "researchInsights": [
    { "finding": "Key finding or insight", "source": "Paper title or source name" }
  ],
  "clinicalTrials": [
    {
      "title": "Trial name",
      "status": "Recruiting/Completed/etc",
      "phase": "Phase 1/2/3/N/A",
      "eligibility": "Brief eligibility criteria",
      "locations": [{ "facility": "Hospital name", "city": "City", "country": "Country" }],
      "contacts": [{ "name": "Contact name", "phone": "Phone", "email": "Email" }],
      "url": "https://clinicaltrials.gov/study/NCT..."
    }
  ],
  "experts": [
    { "name": "Researcher name", "affiliation": "Institution", "contribution": "What they contributed" }
  ],
  "sources": [
    { "title": "Paper title", "authors": ["Author 1", "Author 2"], "year": 2024, "platform": "pubmed/openalex/clinicaltrials", "url": "https://...", "snippet": "Brief excerpt from the paper" }
  ]
}`;

// ── Audience-aware system prompt variants ─────────────────────────────────

const BASE_RULES = `
STRICT RULES:
- Never diagnose ("You have X", "You likely have X")
- Never recommend specific medications or dosages
- Always use hedging: "may", "could", "research suggests", "some studies indicate"
- Always recommend consulting a healthcare professional
- Answer using ONLY the provided research context
- You MUST respond with ONLY valid JSON matching the schema above — no other text`;

const AUDIENCE_INSTRUCTIONS = {
  patient: `You are a compassionate medical research assistant helping a patient understand their condition.
- Use simple, plain language — avoid medical jargon
- Be warm, reassuring, and easy to understand
- Explain medical terms when you must use them
- Focus on practical takeaways the patient can discuss with their doctor`,

  clinician: `You are a medical research assistant supporting a healthcare professional.
- Use precise clinical terminology
- Include mechanistic details, dosing ranges from studies, and statistical findings
- Reference study designs (RCT, meta-analysis, cohort) where relevant
- Be concise and information-dense`,

  researcher: `You are a medical research assistant supporting an academic researcher.
- Focus on study methodology, sample sizes, effect sizes, and p-values
- Highlight gaps in current literature and emerging research directions
- Reference specific journals, authors, and publication years
- Use technical scientific language throughout`,
};

const TONE_INSTRUCTIONS = {
  empathetic: "Use a warm, supportive, and understanding tone throughout your response.",
  clinical: "Use a neutral, precise, and objective tone throughout your response.",
  educational: "Use a clear, informative, and structured tone throughout your response.",
};

const buildSystemPrompt = (promptIntent, audienceLevel = "patient", preferredTone = "educational", patientName = null) => {
  const audienceInstruction = AUDIENCE_INSTRUCTIONS[audienceLevel] || AUDIENCE_INSTRUCTIONS.patient;
  const toneInstruction = TONE_INSTRUCTIONS[preferredTone] || TONE_INSTRUCTIONS.educational;

  const patientInstruction = patientName
    ? `The patient's name is ${patientName}. Address them by name where natural (e.g. "For ${patientName}..."). Make the response feel personal and relevant to their situation.`
    : '';

  const intentContext = {
    medical_query: "Answer the user's health question using ONLY the provided research context.",
    content_generation: "Create accurate, engaging health content based ONLY on the provided research context. Put the full content in conditionOverview.",
    format_conversion: "Convert or reformat the health content as requested, using ONLY the provided context.",
    general: "Provide accurate, balanced information using ONLY the provided research context.",
  };

  return `${audienceInstruction}

${toneInstruction}

${patientInstruction ? patientInstruction + '\n\n' : ''}${intentContext[promptIntent] || intentContext.general}

${BASE_RULES}

You MUST respond with ONLY valid JSON matching this exact schema:
${JSON_SCHEMA}

Populate all fields. For clinicalTrials, include any trials mentioned in the context with their location and contact info. For experts, extract author names from the sources. Every source used must appear in the sources array.`;
};

const buildContextString = (chunks, options = {}) => {
  if (!chunks || chunks.length === 0) return "";

  const { condition, intent, timeframe, patientName, location } = options;
  let context = "--- RESEARCH CONTEXT ---\n";

  // Personalisation header — makes LLM address the patient by name and location
  if (patientName) context += `Patient: ${patientName}\n`;
  if (location)    context += `Location: ${location}\n`;
  if (condition)   context += `Topic: ${condition}${intent ? ` | Focus: ${intent}` : ""}${timeframe ? ` | Timeframe: ${timeframe}` : ""}\n`;
  context += "\n";
  let totalChars = context.length;

  for (const chunk of chunks) {
    let entry = `[${chunk.source?.toUpperCase() || "SOURCE"} | ${chunk.year || "N/A"} | Score: ${chunk.rankingScore || chunk.score}]\nTitle: ${chunk.title || chunk.sourceFile || "Unknown"}\nAuthors: ${chunk.authors || "Unknown"}\nURL: ${chunk.url || "N/A"}\n`;

    // Add clinical trial specific fields if present
    if (chunk.source === "clinicaltrials") {
      if (chunk.trialStatus || chunk.status) entry += `Status: ${chunk.trialStatus || chunk.status}\n`;
      if (chunk.phase) entry += `Phase: ${chunk.phase}\n`;
      if (chunk.eligibility) entry += `Eligibility: ${chunk.eligibility.slice(0, 300)}\n`;
      if (chunk.locations && chunk.locations.length) {
        const locStr = chunk.locations.map((l) => [l.facility, l.city, l.country].filter(Boolean).join(", ")).join(" | ");
        entry += `Locations: ${locStr}\n`;
      }
      if (chunk.contacts && chunk.contacts.length) {
        const conStr = chunk.contacts.map((c) => [c.name, c.phone, c.email].filter(Boolean).join(", ")).join(" | ");
        entry += `Contacts: ${conStr}\n`;
      }
    }

    entry += `${chunk.text}\n\n`;
    if (totalChars + entry.length > CONTEXT_MAX_CHARS) break;
    context += entry;
    totalChars += entry.length;
  }

  context += "--- END CONTEXT ---";
  return context;
};

const buildPrompt = (intent, query, retrievedChunks, options = {}) => {
  const { audienceLevel = "patient", preferredTone = "educational", patientName = null } = options;
  const systemPrompt = buildSystemPrompt(intent, audienceLevel, preferredTone, patientName);
  const contextString = buildContextString(retrievedChunks, options);

  const userMessage = contextString
    ? `${contextString}\n\nUser query: ${query}\n\nRespond with ONLY the JSON object, no other text.`
    : `User query: ${query}\n\nRespond with ONLY the JSON object, no other text.`;

  return { systemPrompt, userMessage };
};

module.exports = { buildPrompt };
