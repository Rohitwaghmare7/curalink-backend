const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const KEYWORD_TAXONOMY = {
  emergency: {
    // Active emergencies block the query completely
    severity: "CRITICAL",
    keywords: [
      "i'm having a heart attack", "having a heart attack", "cardiac arrest",
      "intense chest pain", "can't breathe", "cannot breathe",
      "suicidal", "kill myself", "end my life", "want to die",
      "choking", "unconscious", "not breathing", "severe bleeding",
    ],
  },
  researchTopic: {
    // Medical condition names that trigger disclaimers but DO NOT block the query
    severity: "LOW",
    keywords: [
      "heart attack", "chest pain", "overdose", "suicide", "stroke",
      "poisoning", "poisoned", "anaphylaxis", "allergic reaction severe",
    ],
  },
  diagnosis: {
    // Personal diagnosis queries block the query completely
    severity: "HIGH",
    keywords: [
      "do i have", "is this cancer", "diagnose me", "what disease do i have",
      "what illness do i have", "am i sick", "do i have diabetes", "do i have hiv",
      "is this a tumor", "is this serious", "what is wrong with me",
    ],
  },
  prescription: {
    severity: "HIGH",
    keywords: [
      "what dosage", "prescribe me", "should i take this medication",
      "how much should i take", "what medication should i take",
      "can i take", "is it safe to take", "what drug should i use",
    ],
  },
  sensitive: {
    severity: "MEDIUM",
    keywords: [
      "hiv", "aids", "mental illness", "addiction", "self-harm", "self harm",
      "eating disorder", "anorexia", "bulimia", "depression", "anxiety",
      "bipolar", "schizophrenia", "substance abuse", "drug abuse", "alcohol abuse",
    ],
  },
};

const DISCLAIMERS = {
  emergency: "🚨 If you or someone else is experiencing a medical emergency, please call emergency services immediately — 112 (India) / 911 (US).",
  researchTopic: "⚕️ The information provided about this condition is for educational purposes only. If you are experiencing symptoms, seek immediate professional medical help.",
  diagnosis: "⚕️ Important: This information is for educational purposes only. It does not constitute medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional for personal guidance.",
  prescription: "⚕️ Important: This information is for educational purposes only. It does not constitute medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional for personal guidance.",
  sensitive: "💙 This topic can be sensitive. The information provided is for educational purposes only. Please speak with a healthcare professional for personal support.",
  general: "ℹ️ This content is for informational purposes only and should not replace professional medical advice.",
};

const inspect = (query) => {
  const lower = query.toLowerCase();

  for (const [triggerType, config] of Object.entries(KEYWORD_TAXONOMY)) {
    for (const keyword of config.keywords) {
      // Use regex to match whole words/phrases bounded by spaces or punctuation
      const re = new RegExp(`(?:^|[\\s,.])${escapeRegex(keyword)}(?=[\\s,.]|$)`, 'i');
      if (re.test(lower)) {
        return { isSafe: !shouldBlock(triggerType), triggerType, severity: config.severity };
      }
    }
  }

  return { isSafe: true, triggerType: null, severity: null };
};

const shouldBlock = (triggerType) => {
  return triggerType === "emergency" || triggerType === "diagnosis";
};

const addDisclaimer = (response, triggerType) => {
  if (!triggerType) return response;
  const disclaimer = DISCLAIMERS[triggerType] || DISCLAIMERS.general;
  return `${response}\n\n${disclaimer}`;
};

const getDisclaimer = (triggerType) => {
  if (!triggerType) return DISCLAIMERS.general;
  return DISCLAIMERS[triggerType] || DISCLAIMERS.general;
};

module.exports = { inspect, shouldBlock, addDisclaimer, getDisclaimer };
