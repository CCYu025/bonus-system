// Applies prisma/migrations/*/migration.sql files directly via better-sqlite3.
//
// Why this exists: on this machine, Windows Application Control policy blocks
// Prisma's native schema-engine binary, so `prisma migrate dev` / `db push`
// cannot run. Prisma Client generation (WASM-based) still works fine via
// `prisma generate`. This script is a stand-in for the migrate engine only.
const path = require("node:path");
const fs = require("node:fs");
const Database = require("better-sqlite3");

const dbPath = process.env.MIGRATE_DB_PATH
  ? path.resolve(process.env.MIGRATE_DB_PATH)
  : path.join(__dirname, "..", "prisma", "dev.db");
const migrationsDir = path.join(__dirname, "..", "prisma", "migrations");

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS _applied_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const already = new Set(
  db.prepare("SELECT name FROM _applied_migrations").all().map((r) => r.name)
);

const dirs = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const dir of dirs) {
  if (already.has(dir)) {
    console.log(`skip (already applied): ${dir}`);
    continue;
  }
  const sqlPath = path.join(migrationsDir, dir, "migration.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log(`applying: ${dir}`);
  db.exec("BEGIN");
  try {
    db.exec(sql);
    db.prepare("INSERT INTO _applied_migrations (name) VALUES (?)").run(dir);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

console.log("done.");
