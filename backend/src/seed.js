"use strict";
const { v4: uuidv4 } = require("uuid");
const User = require("./models/User");
const { hashPassword, verifyPassword } = require("./middleware/auth");

async function seedUsers() {
  const seeds = [
    {
      email: process.env.ADMIN_EMAIL || "admin@thesisvault.io",
      password: process.env.ADMIN_PASSWORD || "Admin@12345",
      name: "Admin",
      role: "admin",
    },
    {
      email: process.env.SUPERVISOR_EMAIL || "supervisor@thesisvault.io",
      password: process.env.SUPERVISOR_PASSWORD || "Super@12345",
      name: "Dr. Supervisor",
      role: "supervisor",
    },
    {
      email: process.env.STUDENT_EMAIL || "student@thesisvault.io",
      password: process.env.STUDENT_PASSWORD || "Student@12345",
      name: "Demo Student",
      role: "student",
    },
  ];
  for (const s of seeds) {
    const emailNorm = s.email.toLowerCase().trim();
    const existing = await User.findOne({ email: emailNorm }).lean();
    if (!existing) {
      await User.create({
        id: uuidv4(),
        email: emailNorm,
        password_hash: await hashPassword(s.password),
        name: s.name,
        role: s.role,
        created_at: new Date().toISOString(),
      });
      console.log(`[seed] created ${s.role}: ${emailNorm}`);
    } else {
      // Keep demo passwords in sync with env
      const ok = await verifyPassword(s.password, existing.password_hash);
      if (!ok) {
        await User.updateOne(
          { email: emailNorm },
          { $set: { password_hash: await hashPassword(s.password), role: s.role } }
        );
        console.log(`[seed] refreshed password for ${emailNorm}`);
      }
    }
  }
}

module.exports = { seedUsers };
