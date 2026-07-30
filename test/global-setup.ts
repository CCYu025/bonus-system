import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");
const testDbPath = path.resolve(repoRoot, "prisma/test.db");

// Runs once before the whole test run (not per test file): rebuilds
// prisma/test.db from scratch using the same hand-written SQL migrations the
// real dev/prod db uses (see docs/database.md), so schema drift between test
// and dev is impossible.
export default function setup() {
  for (const p of [testDbPath, `${testDbPath}-journal`]) {
    if (existsSync(p)) rmSync(p);
  }

  execSync("node scripts/migrate.cjs", {
    cwd: repoRoot,
    env: { ...process.env, MIGRATE_DB_PATH: testDbPath },
    stdio: "inherit",
  });
}
