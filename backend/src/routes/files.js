"use strict";
const fs = require("fs");
const path = require("path");
const express = require("express");
const Thesis = require("../models/Thesis");
const { resolveUserFromToken } = require("../middleware/auth");

const router = express.Router();

router.get("/:id", async (req, res) => {
  try {
    const doc = await Thesis.findOne({ id: req.params.id }).lean();
    if (!doc || !doc.file_path) return res.status(404).json({ detail: "File not found" });

    if (doc.status !== "published") {
      // Require auth: owner student, any supervisor, or any admin
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

    if (!fs.existsSync(doc.file_path))
      return res.status(404).json({ detail: "File missing on disk" });

    const filename = doc.file_name || `${doc.id}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${path.basename(filename).replace(/"/g, "")}"`
    );
    return fs.createReadStream(doc.file_path).pipe(res);
  } catch (e) {
    console.error("[download]", e);
    return res.status(500).json({ detail: "Download failed" });
  }
});

module.exports = router;
