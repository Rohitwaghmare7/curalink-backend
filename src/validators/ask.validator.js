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
    .valid('pubmed', 'openalex', 'clinicaltrials', 'uploaded pdfs', 'pdf', 'All Sources')
    .allow(null, ''),
  
  displayText: Joi.string().trim().max(2000).allow(null, ''),
});

module.exports = { askSchema };
