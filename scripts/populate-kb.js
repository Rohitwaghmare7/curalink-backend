/**
 * MASTER Knowledge Base Population Script
 * Automated ingestion of research for 80+ medical conditions.
 * Features: Categorized lists, progress checkpointing, and rate-limit safety.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { runResearchIngestionPipeline } = require("../src/pipelines/research.ingestion.pipeline");
const logger = require("../src/utils/logger");

const PROGRESS_FILE = path.join(__dirname, "ingestion-progress.json");
const MAX_PER_SOURCE = 30; // Depth focused on breadth across many diseases
const SLEEP_BETWEEN_TOPICS_MS = 45000; // 45s sleep to protect API keys

const MASTER_TOPICS = [
  // --- ONCOLOGY ---
  { query: "Breast Cancer", category: "Oncology" },
  { query: "Prostate Cancer", category: "Oncology" },
  { query: "Lung Cancer", category: "Oncology" },
  { query: "Colorectal Cancer", category: "Oncology" },
  { query: "Pancreatic Cancer", category: "Oncology" },
  { query: "Ovarian Cancer", category: "Oncology" },
  { query: "Leukemia", category: "Oncology" },
  { query: "Lymphoma", category: "Oncology" },
  { query: "Melanoma", category: "Oncology" },
  { query: "Liver Cancer", category: "Oncology" },
  { query: "Brain Tumor", category: "Oncology" },
  { query: "Thyroid Cancer", category: "Oncology" },
  { query: "Multiple Myeloma", category: "Oncology" },

  // --- CARDIOVASCULAR ---
  { query: "Hypertension", category: "Cardiology" },
  { query: "Heart Failure", category: "Cardiology" },
  { query: "Myocardial Infarction", category: "Cardiology" },
  { query: "Atrial Fibrillation", category: "Cardiology" },
  { query: "Stroke", category: "Cardiology" },
  { query: "Coronary Artery Disease", category: "Cardiology" },
  { query: "Arrhythmia", category: "Cardiology" },
  { query: "Pericarditis", category: "Cardiology" },

  // --- NEUROLOGY ---
  { query: "Alzheimer's Disease", category: "Neurology" },
  { query: "Parkinson's Disease", category: "Neurology" },
  { query: "Multiple Sclerosis", category: "Neurology" },
  { query: "Epilepsy", category: "Neurology" },
  { query: "Migraine", category: "Neurology" },
  { query: "Dementia", category: "Neurology" },
  { query: "Amyotrophic Lateral Sclerosis", category: "Neurology" },
  { query: "Huntington's Disease", category: "Neurology" },
  { query: "Peripheral Neuropathy", category: "Neurology" },

  // --- ENDOCRINOLOGY / METABOLIC ---
  { query: "Diabetes Type 2", category: "Endocrinology" },
  { query: "PCOS", category: "Endocrinology" },
  { query: "Obesity", category: "Endocrinology" },
  { query: "Hypothyroidism", category: "Endocrinology" },
  { query: "Hyperthyroidism", category: "Endocrinology" },
  { query: "Cushing's Syndrome", category: "Endocrinology" },
  { query: "Addison's Disease", category: "Endocrinology" },
  { query: "Metabolic Syndrome", category: "Endocrinology" },

  // --- INFECTIOUS DISEASE ---
  { query: "HIV/AIDS", category: "Infectious" },
  { query: "Hepatitis C", category: "Infectious" },
  { query: "Hepatitis B", category: "Infectious" },
  { query: "Malaria", category: "Infectious" },
  { query: "Tuberculosis", category: "Infectious" },
  { query: "Zika Virus", category: "Infectious" },
  { query: "Lyme Disease", category: "Infectious" },
  { query: "COVID-19 Research", category: "Infectious" },
  { query: "Sepsis", category: "Infectious" },

  // --- AUTOIMMUNE & RARE ---
  { query: "Systemic Lupus Erythematosus", category: "Autoimmune" },
  { query: "Rheumatoid Arthritis", category: "Autoimmune" },
  { query: "Crohn's Disease", category: "Autoimmune" },
  { query: "Ulcerative Colitis", category: "Autoimmune" },
  { query: "Psoriasis", category: "Autoimmune" },
  { query: "Celiac Disease", category: "Autoimmune" },
  { query: "Cystic Fibrosis", category: "Rare" },
  { query: "Sickle Cell Anemia", category: "Rare" },
  { query: "Thalassemia", category: "Rare" },
  { query: "Marfan Syndrome", category: "Rare" },
  { query: "Ehlers-Danlos Syndrome", category: "Rare" },

  // --- MENTAL HEALTH ---
  { query: "Major Depressive Disorder", category: "MentalHealth" },
  { query: "Generalized Anxiety Disorder", category: "MentalHealth" },
  { query: "Bipolar Disorder", category: "MentalHealth" },
  { query: "Schizophrenia", category: "MentalHealth" },
  { query: "PTSD", category: "MentalHealth" },
  { query: "ADHD", category: "MentalHealth" },
  { query: "Autism Spectrum Disorder", category: "MentalHealth" },
  { query: "Obsessive Compulsive Disorder", category: "MentalHealth" },

  // --- EVERYDAY HEALTH & WELLNESS ---
  { query: "Common Cold", category: "EverydayHealth" },
  { query: "Seasonal Allergies", category: "EverydayHealth" },
  { query: "Acid Reflux GERD", category: "EverydayHealth" },
  { query: "Irritable Bowel Syndrome", category: "EverydayHealth" },
  { query: "Urinary Tract Infection", category: "EverydayHealth" },
  { query: "Acne Vulgaris", category: "EverydayHealth" },
  { query: "Eczema Atopic Dermatitis", category: "EverydayHealth" },
  { query: "Insomnia Sleep Disorders", category: "EverydayHealth" },
  { query: "Chronic Back Pain", category: "EverydayHealth" },
  { query: "Tension Headache", category: "EverydayHealth" },
  { query: "Vitamin D Deficiency", category: "EverydayHealth" },
  { query: "Iron Deficiency Anemia", category: "EverydayHealth" },
  { query: "Vitamin B12 Deficiency", category: "EverydayHealth" },
  { query: "Healthy Diet Nutrition", category: "EverydayHealth" },
  { query: "Physical Activity Benefits", category: "EverydayHealth" },
  { query: "Stress Management Techniques", category: "EverydayHealth" },
  { query: "Pregnancy Health", category: "EverydayHealth" },
  { query: "Menopause Management", category: "EverydayHealth" },
  { query: "Benign Prostatic Hyperplasia", category: "EverydayHealth" },
  { query: "Erectile Dysfunction", category: "EverydayHealth" },
  { query: "Osteoarthritis", category: "EverydayHealth" },
  { query: "Migraine Prevention", category: "EverydayHealth" },
  { query: "Dental Health Cavities", category: "EverydayHealth" },
  { query: "Eye Health Dry Eyes", category: "EverydayHealth" },
  { query: "Postpartum Depression", category: "EverydayHealth" },
  { query: "Celiac Disease Diet", category: "EverydayHealth" },
  { query: "Food Allergies", category: "EverydayHealth" },
  { query: "Intermittent Fasting Research", category: "EverydayHealth" },
  { query: "Keto Diet Studies", category: "EverydayHealth" },
  { query: "Mindfulness Meditation Benefits", category: "EverydayHealth" },
];

/**
 * Load progress from file
 */
const loadProgress = () => {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
  }
  return { completed: [], totalCount: MASTER_TOPICS.length };
};

/**
 * Save progress to file
 */
const saveProgress = (topicQuery) => {
  const progress = loadProgress();
  if (!progress.completed.includes(topicQuery)) {
    progress.completed.push(topicQuery);
  }
  progress.lastUpdate = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
};

const runPopulation = async () => {
  try {
    logger.info("Initializing Global Knowledge Base Population...");
    const progress = loadProgress();
    
    await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
    logger.info("Connected to MongoDB");

    for (const topic of MASTER_TOPICS) {
      if (progress.completed.includes(topic.query)) {
        logger.info(`⏩ Skipping (Already done): "${topic.query}"`);
        continue;
      }

      logger.info(`\n🚀 [${topic.category}] Processing: "${topic.query}"`);
      
      try {
        const result = await runResearchIngestionPipeline({
          query: topic.query,
          sources: ["pubmed", "openalex", "clinicaltrials"],
          maxPerSource: MAX_PER_SOURCE,
        });
        
        logger.info(`✅ Finish "${topic.query}": Ingested ${result.ingested}, Skipped ${result.skipped}`);
        saveProgress(topic.query);
        
      } catch (err) {
        logger.error(`❌ Failed error for "${topic.query}": ${err.message}`);
      }

      logger.info(`Waiting ${SLEEP_BETWEEN_TOPICS_MS / 1000}s... (${progress.completed.length + 1}/${MASTER_TOPICS.length} topics done)`);
      await new Promise(r => setTimeout(r, SLEEP_BETWEEN_TOPICS_MS));
    }

    logger.info("\n✨ ALL TARGET TOPICS PROCESSED.");
  } catch (err) {
    logger.error(`CRITICAL: ${err.message}`);
  } finally {
    await mongoose.disconnect();
  }
};

runPopulation().catch(console.error);
