"use strict";
const { mongoose } = require("../db");

/**
 * ThesisFile stores the raw PDF bytes inside MongoDB (no filesystem).
 * MongoDB has a 16 MB BSON document limit -> we cap uploads at 15 MB.
 * For each thesis the "latest" PDF is kept (one file per thesis for MVP).
 */
const thesisFileSchema = new mongoose.Schema(
  {
    thesis_id: { type: String, required: true, unique: true, index: true },
    filename: { type: String, required: true },
    content_type: { type: String, default: "application/pdf" },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
  },
  { collection: "thesis_files", versionKey: false }
);

thesisFileSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret._id;
    delete ret.data; // never leak raw bytes in JSON
    return ret;
  },
});

module.exports = mongoose.model("ThesisFile", thesisFileSchema);
