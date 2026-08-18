// docs/2026-08-14-employee-score-dashboard/plan.md T-10：AC-10（sticky 表頭／
// 捲動陰影／彈窗高度不隨資料筆數撐高）需要真實瀏覽器排版才驗得到，所以是這份
// spec 裡唯一用 Playwright 的部分。這支 global setup 只做一件事：從乾淨的
// migrations 重建一個獨立的 "e2e" Postgres schema（不動 dev/test schema），
// 並塞入一位「當月有大量每日紀錄」的測試人員，讓 e2e/board.spec.ts 有東西可以捲動。
import { execSync } from "node:child_process";
import path from "node:path";
import crypto from "node:crypto";
import { Client } from "pg";
import { schemaScopedDatabaseUrl } from "../test/db-url";

const repoRoot = path.resolve(__dirname, "..");
export const E2E_EMPLOYEE_ID = "E2E001";
export const E2E_PERSON_NAME = "E2E測試員";
export const E2E_RECORD_DAY_COUNT = 25;

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default async function globalSetup() {
  const databaseUrl = schemaScopedDatabaseUrl("e2e");
  const env = { ...process.env, DATABASE_URL: databaseUrl };

  execSync("node scripts/reset-schema.cjs", { cwd: repoRoot, env, stdio: "inherit" });
  execSync("npx prisma migrate deploy", { cwd: repoRoot, env, stdio: "inherit" });

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const now = () => new Date();

  const categoryId = crypto.randomUUID();
  await client.query(
    `INSERT INTO attendance_category (id, code, name, "sortOrder", "isActive", "locksExtendedFields", "createdAt", "updatedAt")
     VALUES ($1, 'NORMAL', '正常出勤', 1, true, false, $2, $2)`,
    [categoryId, now()]
  );

  const personId = crypto.randomUUID();
  await client.query(
    `INSERT INTO person (id, "employeeId", name, status, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'active', $4, $4)`,
    [personId, E2E_EMPLOYEE_ID, E2E_PERSON_NAME, now()]
  );

  const month = currentMonth();
  for (let day = 1; day <= E2E_RECORD_DAY_COUNT; day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const formId = crypto.randomUUID();
    await client.query(
      `INSERT INTO attendance_form (id, date, status, version, "activeDateKey", "createdAt", "updatedAt")
       VALUES ($1, $2, 'approved', 1, $2, $3, $3)`,
      [formId, date, now()]
    );
    await client.query(
      `INSERT INTO attendance_record
         (id, "formId", "personId", date, "categoryId", voided, "activeKey", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, false, $6, $7, $7)`,
      [crypto.randomUUID(), formId, personId, date, categoryId, `${personId}:${date}`, now()]
    );
  }

  await client.end();
  console.log(`e2e/global-setup: seeded ${E2E_RECORD_DAY_COUNT} days for ${E2E_PERSON_NAME} in ${month}`);
}
