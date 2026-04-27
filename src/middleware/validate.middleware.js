// validate.middleware.js — Generic Joi validation middleware
const logger = require("../utils/logger");

const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true, // Remove unrecognized fields
  });

  if (error) {
    const errorMessages = error.details.map((detail) => detail.message).join(', ');
    logger.warn(`[Validation] Request failed schema validation: ${errorMessages}`);
    return res.status(400).json({
      success: false,
      message: `Invalid request: ${errorMessages}`,
    });
  }

  // Replace req.body with the sanitized and validated values
  req.body = value;
  next();
};

module.exports = { validate };
