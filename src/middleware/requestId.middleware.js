const { v4: uuidv4 } = require("uuid");

const requestId = (req, res, next) => {
  req.requestId = uuidv4();
  res.setHeader("X-Request-ID", req.requestId);
  next();
};

module.exports = requestId;
