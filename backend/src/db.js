"use strict";
const mongoose = require("mongoose");

async function connectDB() {
  const url = process.env.MONGO_URL;
  const dbName = process.env.DB_NAME;
  if (!url || !dbName) throw new Error("MONGO_URL and DB_NAME must be set");
  mongoose.set("strictQuery", false);
  await mongoose.connect(url, { dbName, serverSelectionTimeoutMS: 10000 });
  console.log(`[db] connected to ${dbName}`);
}

module.exports = { connectDB, mongoose };
