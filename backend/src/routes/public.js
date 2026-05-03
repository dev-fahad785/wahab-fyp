"use strict";
const express = require("express");
const Thesis = require("../models/Thesis");

const router = express.Router();

function thesisView(doc) {
  if (!doc) return doc;
  const { _id, file_path, __v, ...rest } = doc;
  rest.has_file = Boolean(file_path);
  return rest;
}

router.get("/theses", async (req, res) => {
  const { q, year } = req.query;
  const query = { status: "published" };
  if (year) query.year = Number(year);
  if (q && String(q).trim()) {
    const regex = { $regex: String(q).trim(), $options: "i" };
    query.$or = [
      { title: regex },
      { abstract: regex },
      { keywords: { $elemMatch: regex } },
      { program: regex },
      { student_name: regex },
    ];
  }
  const docs = await Thesis.find(query).sort({ published_at: -1 }).lean();
  return res.json(docs.map(thesisView));
});

router.get("/theses/:id", async (req, res) => {
  const doc = await Thesis.findOne({ id: req.params.id, status: "published" }).lean();
  if (!doc) return res.status(404).json({ detail: "Not found" });
  return res.json(thesisView(doc));
});

module.exports = router;
