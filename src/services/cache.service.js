const NodeCache = require("node-cache");

// Set default TTL to 1 hour (3600 seconds), and check for expired keys every 2 minutes
const reqCache = new NodeCache({ stdTTL: 3600, checkperiod: 120, useClones: false });

module.exports = reqCache;
