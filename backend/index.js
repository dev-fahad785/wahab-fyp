"use strict";
// Load env FIRST
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");

const { connectDB } = require("./src/db");
const { seedUsers } = require("./src/seed");

const authRoutes = require("./src/routes/auth");
const thesesRoutes = require("./src/routes/theses");
const publicRoutes = require("./src/routes/public");
const filesRoutes = require("./src/routes/files");

const PORT = Number(process.env.PORT || 8002);

const app = express();

app.use(
  cors({
    origin: (process.env.CORS_ORIGINS || "*").split(",").map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Friendly request log (compact)
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  if (!req.url.startsWith("/api/files/")) {
    console.log(`[${ts}] ${req.method} ${req.url}`);
  }
  next();
});

app.get("/api/", (_req, res) => res.json({ message: "ThesisVault API", status: "ok", stack: "MERN" }));

app.use("/api/auth", authRoutes);
app.use("/api/theses", thesesRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/files", filesRoutes);

// Generic 404 for unmatched /api
app.use("/api", (_req, res) => res.status(404).json({ detail: "Not found" }));

// Multer / generic error handler
app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  const status = err.status || (err.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  res.status(status).json({ detail: err.message || "Server error" });
});

async function main() {
  await connectDB();
  await seedUsers();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[thesisvault] MERN backend listening on 0.0.0.0:${PORT}`);
  });
}

main().catch((e) => {
  console.error("Fatal boot error:", e);
  process.exit(1);
});

// Graceful shutdown
function shutdown() {
  console.log("[thesisvault] shutting down");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
