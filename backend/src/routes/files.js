"use strict";
const express = require("express");
const Thesis = require("../models/Thesis");
const ThesisFile = require("../models/ThesisFile");
const { resolveUserFromToken } = require("../middleware/auth");

const router = express.Router();

router.get("/:id", async (req, res) => {
  try {
    const doc = await Thesis.findOne({ id: req.params.id }).lean();
    if (!doc) return res.status(404).json({ detail: "Thesis not found" });

    if (doc.status !== "published") {
      let token = null;
      const authHeader = req.headers.authorization || "";
      if (authHeader.toLowerCase().startsWith("bearer ")) token = authHeader.slice(7);
      else if (req.query.token) token = String(req.query.token);

      if (!token) return res.status(401).json({ detail: "Authentication required" });

      let user;
      try {
        user = await resolveUserFromToken(token);
      } catch (_e) {
        return res.status(401).json({ detail: "Invalid or expired token" });
      }
      if (user.role === "student" && doc.student_id !== user.id)
        return res.status(403).json({ detail: "Not your thesis" });
    }

    const file = await ThesisFile.findOne({ thesis_id: doc.id }).lean();
    if (!file) return res.status(404).json({ detail: "File not found" });

    // Mongo returns Buffer for Buffer fields via lean(); normalize just in case.
    const buf = Buffer.isBuffer(file.data)
      ? file.data
      : file.data && file.data.buffer
      ? Buffer.from(file.data.buffer)
      : null;
    if (!buf) return res.status(500).json({ detail: "Corrupted file" });

    const filename = (file.filename || `${doc.id}.pdf`).replace(/"/g, "");
    res.setHeader("Content-Type", file.content_type || "application/pdf");
    res.setHeader("Content-Length", buf.length);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    return res.send(buf);
  } catch (e) {
    console.error("[download]", e);
    return res.status(500).json({ detail: "Download failed" });
  }
});

module.exports = router;
