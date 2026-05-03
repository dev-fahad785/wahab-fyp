"use strict";
const { mongoose } = require("../db");

const reviewSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    thesis_id: { type: String, required: true, index: true },
    supervisor_id: { type: String, required: true },
    supervisor_name: { type: String, required: true },
    decision: { type: String, enum: ["approve", "reject", "changes"], required: true },
    comment: { type: String, default: "" },
    created_at: { type: String, required: true },
  },
  { collection: "reviews", versionKey: false, strict: false }
);

reviewSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model("Review", reviewSchema);
