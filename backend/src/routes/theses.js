"use strict";
const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const Thesis = require("../models/Thesis");
const Review = require("../models/Review");
const { authRequired, requireRole } = require("../middleware/auth");

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/backend/uploads";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// All files land in memory, we validate + move manually so every thesis_id.pdf is canonical.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "application/pdf" ||
      (file.originalname && file.originalname.toLowerCase().endsWith(".pdf"));
    if (!ok) return cb(new Error("Only PDF files are allowed"));
    cb(null, true);
  },
});

function nowIso() {
  return new Date().toISOString();
}

function parseKeywords(raw) {
  if (raw == null || raw === "") return [];
  const s = String(raw).trim();
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((k) => String(k).trim()).filter(Boolean);
    } catch (_e) { /* fall through */ }
  }
  return s.split(",").map((k) => k.trim()).filter(Boolean);
}

function thesisView(doc) {
  if (!doc) return doc;
  const obj = doc.toJSON ? doc.toJSON() : { ...doc };
  delete obj._id;
  const { file_path, ...rest } = obj;
  rest.has_file = Boolean(file_path);
  return rest;
}

async function persistPdf(thesisId, file) {
  if (!file) throw Object.assign(new Error("File required"), { status: 400 });
  if (!file.buffer || file.buffer.length === 0)
    throw Object.assign(new Error("Uploaded file is empty"), { status: 400 });
  const dest = path.join(UPLOAD_DIR, `${thesisId}.pdf`);
  fs.writeFileSync(dest, file.buffer);
  return { file_name: file.originalname || `${thesisId}.pdf`, file_path: dest, file_size: file.buffer.length };
}

// ---------- Create (student) ----------
router.post(
  "/",
  authRequired,
  requireRole("student"),
  upload.single("file"),
  async (req, res) => {
    try {
      const { title, abstract, year, program, keywords } = req.body || {};
      if (!title || !abstract || !year || !program)
        return res.status(422).json({ detail: "title, abstract, year, program are required" });

      const thesisId = uuidv4();
      const doc = {
        id: thesisId,
        student_id: req.user.id,
        student_name: req.user.name,
        student_email: req.user.email,
        title: String(title).trim(),
        abstract: String(abstract).trim(),
        year: Number(year),
        program: String(program).trim(),
        keywords: parseKeywords(keywords),
        status: "draft",
        supervisor_id: null,
        supervisor_name: null,
        file_name: null,
        file_path: null,
        file_size: null,
        created_at: nowIso(),
        updated_at: nowIso(),
        submitted_at: null,
        published_at: null,
      };
      if (req.file) Object.assign(doc, await persistPdf(thesisId, req.file));
      await Thesis.create(doc);
      return res.json(thesisView(doc));
    } catch (e) {
      console.error("[create thesis]", e);
      return res.status(e.status || 500).json({ detail: e.message || "Failed to create thesis" });
    }
  }
);

// ---------- List: mine (student) ----------
router.get("/mine", authRequired, requireRole("student"), async (req, res) => {
  const docs = await Thesis.find({ student_id: req.user.id }).sort({ created_at: -1 }).lean();
  return res.json(docs.map(thesisView));
});

// ---------- List: submitted+changes+rejected+approved (supervisor/admin) ----------
router.get("/submitted", authRequired, requireRole("supervisor", "admin"), async (_req, res) => {
  const docs = await Thesis.find({
    status: { $in: ["submitted", "changes", "rejected", "approved"] },
  })
    .sort({ submitted_at: -1 })
    .lean();
  return res.json(docs.map(thesisView));
});

// ---------- List: approved+published (admin) ----------
router.get("/approved", authRequired, requireRole("admin"), async (_req, res) => {
  const docs = await Thesis.find({ status: { $in: ["approved", "published"] } })
    .sort({ updated_at: -1 })
    .lean();
  return res.json(docs.map(thesisView));
});

// ---------- Get one ----------
router.get("/:id", authRequired, async (req, res) => {
  const doc = await Thesis.findOne({ id: req.params.id }).lean();
  if (!doc) return res.status(404).json({ detail: "Thesis not found" });
  if (req.user.role === "student" && doc.student_id !== req.user.id)
    return res.status(403).json({ detail: "Not your thesis" });
  return res.json(thesisView(doc));
});

// ---------- Update ----------
router.put(
  "/:id",
  authRequired,
  requireRole("student"),
  upload.single("file"),
  async (req, res) => {
    try {
      const doc = await Thesis.findOne({ id: req.params.id }).lean();
      if (!doc) return res.status(404).json({ detail: "Thesis not found" });
      if (doc.student_id !== req.user.id) return res.status(403).json({ detail: "Not your thesis" });
      if (!["draft", "changes", "rejected"].includes(doc.status))
        return res
          .status(400)
          .json({ detail: "Cannot edit after submission unless changes were requested" });

      const { title, abstract, year, program, keywords } = req.body || {};
      const updates = { updated_at: nowIso() };
      if (title !== undefined) updates.title = String(title).trim();
      if (abstract !== undefined) updates.abstract = String(abstract).trim();
      if (year !== undefined) updates.year = Number(year);
      if (program !== undefined) updates.program = String(program).trim();
      if (keywords !== undefined) updates.keywords = parseKeywords(keywords);
      if (req.file) Object.assign(updates, await persistPdf(doc.id, req.file));

      await Thesis.updateOne({ id: doc.id }, { $set: updates });
      const fresh = await Thesis.findOne({ id: doc.id }).lean();
      return res.json(thesisView(fresh));
    } catch (e) {
      console.error("[update thesis]", e);
      return res.status(e.status || 500).json({ detail: e.message || "Failed to update" });
    }
  }
);

// ---------- Submit (student) ----------
router.post("/:id/submit", authRequired, requireRole("student"), async (req, res) => {
  const doc = await Thesis.findOne({ id: req.params.id }).lean();
  if (!doc) return res.status(404).json({ detail: "Thesis not found" });
  if (doc.student_id !== req.user.id) return res.status(403).json({ detail: "Not your thesis" });
  if (!doc.file_path) return res.status(400).json({ detail: "Upload a PDF before submitting" });
  if (!["draft", "changes", "rejected"].includes(doc.status))
    return res.status(400).json({ detail: "Already submitted" });
  const ts = nowIso();
  await Thesis.updateOne(
    { id: doc.id },
    { $set: { status: "submitted", submitted_at: ts, updated_at: ts } }
  );
  const fresh = await Thesis.findOne({ id: doc.id }).lean();
  return res.json(thesisView(fresh));
});

// ---------- Review (supervisor) ----------
router.post("/:id/review", authRequired, requireRole("supervisor"), async (req, res) => {
  const doc = await Thesis.findOne({ id: req.params.id }).lean();
  if (!doc) return res.status(404).json({ detail: "Thesis not found" });
  if (doc.status !== "submitted")
    return res.status(400).json({ detail: "Thesis is not awaiting review" });
  const { decision, comment } = req.body || {};
  if (!["approve", "reject", "changes"].includes(decision))
    return res.status(422).json({ detail: "decision must be approve|reject|changes" });
  const decisionMap = { approve: "approved", reject: "rejected", changes: "changes" };
  const newStatus = decisionMap[decision];
  await Review.create({
    id: uuidv4(),
    thesis_id: doc.id,
    supervisor_id: req.user.id,
    supervisor_name: req.user.name,
    decision,
    comment: typeof comment === "string" ? comment : "",
    created_at: nowIso(),
  });
  await Thesis.updateOne(
    { id: doc.id },
    {
      $set: {
        status: newStatus,
        supervisor_id: req.user.id,
        supervisor_name: req.user.name,
        updated_at: nowIso(),
      },
    }
  );
  const fresh = await Thesis.findOne({ id: doc.id }).lean();
  return res.json(thesisView(fresh));
});

// ---------- Review list ----------
router.get("/:id/reviews", authRequired, async (req, res) => {
  const doc = await Thesis.findOne({ id: req.params.id }).lean();
  if (!doc) return res.status(404).json({ detail: "Thesis not found" });
  if (req.user.role === "student" && doc.student_id !== req.user.id)
    return res.status(403).json({ detail: "Not your thesis" });
  const reviews = await Review.find({ thesis_id: doc.id }).sort({ created_at: -1 }).lean();
  return res.json(
    reviews.map((r) => {
      delete r._id;
      return r;
    })
  );
});

// ---------- Publish / Unpublish (admin) ----------
router.post("/:id/publish", authRequired, requireRole("admin"), async (req, res) => {
  const doc = await Thesis.findOne({ id: req.params.id }).lean();
  if (!doc) return res.status(404).json({ detail: "Thesis not found" });
  if (!["approved", "published"].includes(doc.status))
    return res.status(400).json({ detail: "Only approved theses can be published" });
  const ts = nowIso();
  await Thesis.updateOne(
    { id: doc.id },
    { $set: { status: "published", published_at: ts, updated_at: ts } }
  );
  const fresh = await Thesis.findOne({ id: doc.id }).lean();
  return res.json(thesisView(fresh));
});

router.post("/:id/unpublish", authRequired, requireRole("admin"), async (req, res) => {
  const doc = await Thesis.findOne({ id: req.params.id }).lean();
  if (!doc) return res.status(404).json({ detail: "Thesis not found" });
  if (doc.status !== "published")
    return res.status(400).json({ detail: "Thesis is not published" });
  await Thesis.updateOne(
    { id: doc.id },
    { $set: { status: "approved", updated_at: nowIso() } }
  );
  const fresh = await Thesis.findOne({ id: doc.id }).lean();
  return res.json(thesisView(fresh));
});

module.exports = router;
