// docs/2026-08-14-employee-score-dashboard/plan.md T-10：AC-10（sticky 表頭／
// 捲動陰影／彈窗高度不隨資料筆數撐高）需要真實瀏覽器排版才驗得到，所以是這份
// spec 裡唯一用 Playwright 的部分。這支 global setup 只做一件事：從乾淨的
// migrations 重建一個獨立的 prisma/e2e.db（不動 dev.db／test.db），並塞入一位
// 「當月有大量每日紀錄」的測試人員，讓 e2e/board.spec.ts 有東西可以捲動。
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const repoRoot = path.resolve(__dirname, "..");
export const E2E_DB_PATH = path.resolve(repoRoot, "prisma/e2e.db");
export const E2E_EMPLOYEE_ID = "E2E001";
export const E2E_PERSON_NAME = "E2E測試員";
export const E2E_RECORD_DAY_COUNT = 25;

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default async function globalSetup() {
  for (const p of [E2E_DB_PATH, `${E2E_DB_PATH}-journal`]) {
    if (existsSync(p)) rmSync(p);
  }

  execSync("node scripts/migrate.cjs", {
    cwd: repoRoot,
    env: { ...process.env, MIGRATE_DB_PATH: E2E_DB_PATH },
    stdio: "inherit",
  });

  const db = new Database(E2E_DB_PATH);
  db.pragma("foreign_keys = ON");
  const now = () => new Date().toISOString();

  const categoryId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO attendance_category (id, code, name, sortOrder, isActive, locksExtendedFields, createdAt, updatedAt)
     VALUES (?, 'NORMAL', '正常出勤', 1, 1, 0, ?, ?)`
  ).run(categoryId, now(), now());

  const personId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO person (id, employeeId, name, status, createdAt, updatedAt)
     VALUES (?, ?, ?, 'active', ?, ?)`
  ).run(personId, E2E_EMPLOYEE_ID, E2E_PERSON_NAME, now(), now());

  const insertForm = db.prepare(
    `INSERT INTO attendance_form (id, date, status, version, activeDateKey, createdAt, updatedAt)
     VALUES (?, ?, 'approved', 1, ?, ?, ?)`
  );
  const insertRecord = db.prepare(
    `INSERT INTO attendance_record
       (id, formId, personId, date, categoryId, voided, activeKey, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
  );

  const month = currentMonth();
  for (let day = 1; day <= E2E_RECORD_DAY_COUNT; day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const formId = crypto.randomUUID();
    insertForm.run(formId, date, date, now(), now());
    insertRecord.run(
      crypto.randomUUID(),
      formId,
      personId,
      date,
      categoryId,
      `${personId}:${date}`,
      now(),
      now()
    );
  }

  db.close();
  console.log(`e2e/global-setup: seeded ${E2E_RECORD_DAY_COUNT} days for ${E2E_PERSON_NAME} in ${month}`);
}
