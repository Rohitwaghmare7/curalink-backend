const https = require("https");
const logger = require("../utils/logger");

const BASE_URL = "https://clinicaltrials.gov/api/v2/studies";

const get = (url) =>
  new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("ClinicalTrials JSON parse failed")); }
      });
    }).on("error", reject);
  });

const searchTrials = async (query, maxResults = 10) => {
  logger.info(`[ClinicalTrials] Searching: "${query}" (max ${maxResults})`);
  const q = encodeURIComponent(query);
  // Added: EligibilityCriteria, LocationFacility, LocationCity, LocationCountry,
  //        CentralContactName, CentralContactPhone, CentralContactEMail
  const fields = [
    "NCTId", "BriefTitle", "BriefSummary", "OverallStatus", "Phase",
    "StartDate", "LeadSponsorName", "Condition",
    "EligibilityCriteria", "LocationFacility", "LocationCity", "LocationCountry",
    "CentralContactName", "CentralContactPhone", "CentralContactEMail",
  ].join(",");
  const url = `${BASE_URL}?query.cond=${q}&pageSize=${maxResults}&format=json&fields=${fields}`;

  const data = await get(url);
  const studies = data?.studies || [];

  const papers = studies.map((s) => {
    const p = s.protocolSection || {};
    const id = p.identificationModule?.nctId || `ct_${Date.now()}`;
    const title = p.identificationModule?.briefTitle || "Untitled Trial";
    const summary = p.descriptionModule?.briefSummary || "";
    const status = p.statusModule?.overallStatus || "Unknown";
    const phase = (p.designModule?.phases || []).join(", ") || "N/A";
    const startDate = p.statusModule?.startDateStruct?.date || "";
    const year = startDate ? parseInt(startDate.slice(0, 4)) : null;
    const sponsor = p.sponsorCollaboratorsModule?.leadSponsor?.name || "";
    const conditions = (p.conditionsModule?.conditions || []).join(", ");

    // Eligibility criteria
    const eligibility = p.eligibilityModule?.eligibilityCriteria || "";

    // Locations — extract unique facility/city/country combos
    const locationList = p.contactsLocationsModule?.locations || [];
    const locations = locationList.slice(0, 5).map((loc) => ({
      facility: loc.facility || "",
      city: loc.city || "",
      country: loc.country || "",
    })).filter((loc) => loc.facility || loc.city);

    // Central contact info
    const centralContacts = p.contactsLocationsModule?.centralContacts || [];
    const contacts = centralContacts.slice(0, 2).map((c) => ({
      name: c.name || "",
      phone: c.phone || "",
      email: c.email || "",
    })).filter((c) => c.name || c.email);

    const abstract = [
      summary,
      eligibility ? `\nEligibility: ${eligibility.slice(0, 500)}` : "",
      locations.length ? `\nLocations: ${locations.map((l) => [l.facility, l.city, l.country].filter(Boolean).join(", ")).join(" | ")}` : "",
      `\nStatus: ${status} | Phase: ${phase} | Sponsor: ${sponsor} | Conditions: ${conditions}`,
    ].join("");

    return {
      paperId: `clinicaltrials_${id}`,
      title,
      abstract,
      authors: sponsor ? [sponsor] : [],
      year,
      source: "clinicaltrials",
      url: `https://clinicaltrials.gov/study/${id}`,
      status,
      phase,
      eligibility,
      locations,
      contacts,
    };
  });

  logger.info(`[ClinicalTrials] Found ${papers.length} trials`);
  return papers;
};

module.exports = { searchTrials };
