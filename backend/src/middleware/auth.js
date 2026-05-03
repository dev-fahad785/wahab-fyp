"use strict";
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_ALGORITHM = "HS256";
const ACCESS_TOKEN_TTL = "24h";

function jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET not configured");
  return s;
}

async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

async function verifyPassword(plain, hash) {
  try {
    return await bcrypt.compare(plain, hash);
  } catch (_e) {
    return false;
  }
}

function createAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, type: "access" },
    jwtSecret(),
    { algorithm: JWT_ALGORITHM, expiresIn: ACCESS_TOKEN_TTL }
  );
}

function decodeToken(token) {
  const payload = jwt.verify(token, jwtSecret(), { algorithms: [JWT_ALGORITHM] });
  if (payload.type !== "access") {
    const e = new Error("Invalid token type");
    e.status = 401;
    throw e;
  }
  return payload;
}

async function resolveUserFromToken(token) {
  const payload = decodeToken(token);
  const user = await User.findOne({ id: payload.sub }).lean();
  if (!user) {
    const e = new Error("User not found");
    e.status = 401;
    throw e;
  }
  delete user._id;
  delete user.password_hash;
  return user;
}

function extractBearer(req) {
  const h = req.headers["authorization"] || req.headers["Authorization"] || "";
  if (typeof h === "string" && h.toLowerCase().startsWith("bearer ")) return h.slice(7);
  return null;
}

// Express middleware: requires valid bearer token, attaches req.user
async function authRequired(req, res, next) {
  try {
    const token = extractBearer(req);
    if (!token) return res.status(401).json({ detail: "Not authenticated" });
    req.user = await resolveUserFromToken(token);
    next();
  } catch (e) {
    if (e.name === "TokenExpiredError") return res.status(401).json({ detail: "Token expired" });
    if (e.name === "JsonWebTokenError") return res.status(401).json({ detail: "Invalid token" });
    return res.status(e.status || 401).json({ detail: e.message || "Unauthenticated" });
  }
}

// Middleware factory: after authRequired, enforces one of the provided roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ detail: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ detail: `Requires role: ${roles.join(", ")}` });
    }
    next();
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  createAccessToken,
  decodeToken,
  resolveUserFromToken,
  authRequired,
  requireRole,
};
