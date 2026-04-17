const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "curalink-secret-change-in-production";
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const signToken = (userId) => {
  return jwt.sign({ id: userId }, SECRET, { expiresIn: EXPIRES_IN });
};

const verifyToken = (token) => {
  return jwt.verify(token, SECRET);
};

module.exports = { signToken, verifyToken };
