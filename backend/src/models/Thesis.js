"use strict";
const { mongoose } = require("../db");

const thesisSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    student_id: { type: String, required: true, index: true },
    student_name: { type: String, required: true },
    student_email: { type: String, required: true },
    title: { type: String, required: true },
    abstract: { type: String, required: true },
    year: { type: Number, required: true },
    program: { type: String, required: true },
    keywords: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["draft", "submitted", "approved", "rejected", "changes", "published"],
      default: "draft",
      index: true,
    },
    supervisor_id: { type: String, default: null },
    supervisor_name: { type: String, default: null },
    file_name: { type: String, default: null },
    file_path: { type: String, default: null },
    file_size: { type: Number, default: null },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
    submitted_at: { type: String, default: null },
    published_at: { type: String, default: null },
  },
  { collection: "theses", versionKey: false, strict: false }
);

// Public projection (strip _id & file_path, expose has_file)
thesisSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { _id, file_path, ...rest } = ret;
    rest.has_file = Boolean(file_path);
    return rest;
  },
});

module.exports = mongoose.model("Thesis", thesisSchema);
