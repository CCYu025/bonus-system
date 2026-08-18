import { execSync } from "node:child_process";
import path from "node:path";
import { schemaScopedDatabaseUrl } from "./db-url";

const repoRoot = path.resolve(__dirname, "..");

// Runs once before the whole test run (not per test file): rebuilds the
// "test" Postgres schema from scratch using the real prisma/migrations/*
// (see docs/database.md), so schema drift between test and dev is impossible.
export default function setup() {
  const databaseUrl = schemaScopedDatabaseUrl("test");
  const env = { ...process.env, DATABASE_URL: databaseUrl };

  execSync("node scripts/reset-schema.cjs", {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });

  execSync("npx prisma migrate deploy", {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
}
