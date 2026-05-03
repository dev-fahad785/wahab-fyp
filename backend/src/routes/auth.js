"use strict";
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const User = require("../models/User");
const { hashPassword, verifyPassword, createAccessToken, authRequired } = require("../middleware/auth");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeUser(u) {
  const { _id, password_hash, __v, ...rest } = u;
  return rest;
}

router.post("/register", async (req, res) => {
  try {
    const { email, password, name, role } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) return res.status(422).json({ detail: "Invalid email" });
    if (!password || String(password).length < 6)
      return res.status(422).json({ detail: "Password must be at least 6 characters" });
    if (!name || !String(name).trim()) return res.status(422).json({ detail: "Name is required" });
    if (!["student", "supervisor"].includes(role))
      return res.status(422).json({ detail: "Role must be student or supervisor" });

    const emailNorm = String(email).toLowerCase().trim();
    const existing = await User.findOne({ email: emailNorm }).lean();
    if (existing) return res.status(400).json({ detail: "Email already registered" });

    const doc = {
      id: uuidv4(),
      email: emailNorm,
      password_hash: await hashPassword(password),
      name: String(name).trim(),
      role,
      created_at: new Date().toISOString(),
    };
    await User.create(doc);
    const token = createAccessToken(doc);
    return res.json({ access_token: token, token_type: "bearer", user: sanitizeUser(doc) });
  } catch (e) {
    console.error("[register]", e);
    return res.status(500).json({ detail: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(401).json({ detail: "Invalid email or password" });
    const emailNorm = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: emailNorm }).lean();
    if (!user) return res.status(401).json({ detail: "Invalid email or password" });
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ detail: "Invalid email or password" });
    const token = createAccessToken(user);
    return res.json({ access_token: token, token_type: "bearer", user: sanitizeUser(user) });
  } catch (e) {
    console.error("[login]", e);
    return res.status(500).json({ detail: "Login failed" });
  }
});

router.get("/me", authRequired, async (req, res) => {
  return res.json(req.user);
});

module.exports = router;
