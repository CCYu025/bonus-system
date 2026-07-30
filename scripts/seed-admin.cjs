// T-14: creates the single seed developer account (idempotent) so the system
// can be logged into immediately after migration, before any other account exists.
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "..", "prisma", "dev.db");
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const now = () => new Date().toISOString();

const username = process.env.ADMIN_USERNAME ?? "admin";
const password = process.env.ADMIN_PASSWORD ?? "admin1234";
const displayName = process.env.ADMIN_DISPLAY_NAME ?? "系統管理員";

const existing = db
  .prepare("SELECT id FROM user WHERE username = ?")
  .get(username);

if (existing) {
  console.log(`skip (already exists): ${username}`);
} else {
  const passwordHash = bcrypt.hashSync(password, 12);
  db.prepare(
    `INSERT INTO user (id, username, passwordHash, role, displayName, isActive, createdAt, updatedAt)
     VALUES (@id, @username, @passwordHash, 'developer', @displayName, 1, @createdAt, @updatedAt)`
  ).run({
    id: crypto.randomUUID(),
    username,
    passwordHash,
    displayName,
    createdAt: now(),
    updatedAt: now(),
  });
  console.log(`seeded developer account: ${username} (password: ${password})`);
}
