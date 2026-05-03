"use strict";
const fs = require("fs");
const Thesis = require("./models/Thesis");
const ThesisFile = require("./models/ThesisFile");

/**
 * One-shot migration: if a thesis doc still has `file_path` pointing to disk,
 * read that PDF and move it into the `thesis_files` MongoDB collection, then
 * strip `file_path` from the thesis. Safe to run on every boot — no-op once done.
 */
async function migrateDiskFilesToDb() {
  // First pass: move any files still on disk into Mongo.
  const needsMigration = await Thesis.find({
    file_path: { $exists: true, $ne: null },
  }).lean();

  if (needsMigration.length > 0) {
    let migrated = 0;
    let missing = 0;
    const nowIso = new Date().toISOString();

    for (const t of needsMigration) {
      try {
        const existing = await ThesisFile.findOne({ thesis_id: t.id }).lean();
        if (existing) continue;
        if (!fs.existsSync(t.file_path)) {
          missing += 1;
          continue;
        }
        const buf = fs.readFileSync(t.file_path);
        await ThesisFile.create({
          thesis_id: t.id,
          filename: t.file_name || `${t.id}.pdf`,
          content_type: "application/pdf",
          size: buf.length,
          data: buf,
          created_at: t.created_at || nowIso,
          updated_at: nowIso,
        });
        await Thesis.updateOne({ id: t.id }, { $set: { file_size: buf.length } });
        migrated += 1;
      } catch (e) {
        console.error(`[migrate] failed for thesis ${t.id}:`, e.message);
      }
    }
    if (migrated || missing) {
      console.log(`[migrate] moved ${migrated} pdf(s) disk -> db; ${missing} missing from disk`);
    }
  }

  // Second pass: purge the obsolete `file_path` field from every thesis document.
  const purge = await Thesis.updateMany(
    { file_path: { $exists: true } },
    { $unset: { file_path: "" } }
  );
  if (purge.modifiedCount > 0) {
    console.log(`[migrate] unset legacy file_path on ${purge.modifiedCount} thesis doc(s)`);
  }
}

module.exports = { migrateDiskFilesToDb };
