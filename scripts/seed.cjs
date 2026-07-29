const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "..", "prisma", "dev.db");
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const now = () => new Date().toISOString();

const categories = [
  { code: "NORMAL", name: "正常出勤", sortOrder: 1 },
  { code: "PERSONAL_LEAVE", name: "事假", sortOrder: 2 },
  { code: "SICK_LEAVE", name: "病假", sortOrder: 3 },
  { code: "ANNUAL_LEAVE", name: "特休", sortOrder: 4 },
];

const insertCategory = db.prepare(`
  INSERT INTO attendance_category (id, code, name, sortOrder, isActive, createdAt, updatedAt)
  VALUES (@id, @code, @name, @sortOrder, 1, @createdAt, @updatedAt)
  ON CONFLICT(code) DO NOTHING
`);

for (const c of categories) {
  insertCategory.run({
    id: crypto.randomUUID(),
    ...c,
    createdAt: now(),
    updatedAt: now(),
  });
}

console.log("seeded attendance_category (idempotent).");
