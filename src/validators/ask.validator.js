const Joi = require('joi');

const askSchema = Joi.object({
  query: Joi.string()
    .trim()
    .min(1)
    .max(500)
    .required()
    .messages({
      'string.empty': 'Query cannot be empty.',
      'string.max': 'Query is too long (max 500 characters).',
      'any.required': 'Query is required.'
    }),
  
  disease: Joi.string().trim().max(100).allow(null, ''),
  patientName: Joi.string().trim().max(100).allow(null, ''),
  location: Joi.string().trim().max(100).allow(null, ''),
  
  source: Joi.string()
    .valid('pubmed', 'openalex', 'clinicaltrials', 'uploaded pdfs', 'Uploaded PDFs', 'pdf', 'All Sources')
    .allow(null, ''),
  
  displayText: Joi.string().trim().max(2000).allow(null, ''),
  
  // Adding missing fields that were stripped by validate.middleware.js
  sessionId: Joi.string().trim().allow(null, ''),
  additionalQuery: Joi.string().trim().max(500).allow(null, ''),
  userId: Joi.string().trim().allow(null, ''),
  audienceLevel: Joi.string().trim().allow(null, ''),
  preferredTone: Joi.string().trim().allow(null, ''),
  options: Joi.object().unknown(true).allow(null),
});

module.exports = { askSchema };
