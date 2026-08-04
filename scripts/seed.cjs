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
  { code: "HOLIDAY_OVERTIME", name: "假日加班", sortOrder: 5 },
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

// docs/2026-08-03-attendance-leave-lock-sop-field：事假／病假／特休鎖定加班時數／
// 配合度／3S表現／SOP表現／實際產量（備註不受影響）。其餘既有類別維持預設 false。
db.prepare(`
  UPDATE attendance_category
  SET locksExtendedFields = 1
  WHERE code IN ('PERSONAL_LEAVE', 'SICK_LEAVE', 'ANNUAL_LEAVE')
`).run();

console.log("marked leave categories as locksExtendedFields (idempotent).");

// 3S表現的「正常」預設選項：這是既有開放 CRUD 清單，可能已經有人透過畫面手動
// 建立過同名選項（且已被既有記錄引用）——先查再決定 update 既有列或 insert 新列，
// 避免清單裡出現兩筆「正常」（詳見 docs/2026-08-03-attendance-leave-lock-sop-field/plan.md T-1）。
const existingNormal3s = db
  .prepare(`SELECT id FROM three_s_performance WHERE name = '正常'`)
  .get();

if (existingNormal3s) {
  db.prepare(`UPDATE three_s_performance SET isLocked = 1 WHERE id = ?`).run(
    existingNormal3s.id
  );
  console.log("locked existing 3S表現「正常」option.");
} else {
  db.prepare(
    `
    INSERT INTO three_s_performance (id, code, name, sortOrder, isActive, isLocked, createdAt, updatedAt)
    VALUES (@id, @code, @name, @sortOrder, 1, 1, @createdAt, @updatedAt)
    ON CONFLICT(code) DO NOTHING
  `
  ).run({
    id: crypto.randomUUID(),
    code: "NORMAL_3S",
    name: "正常",
    sortOrder: 0,
    createdAt: now(),
    updatedAt: now(),
  });
  console.log("seeded new 3S表現「正常」option.");
}

// SOP表現是全新清單，沒有既有資料，直接塞一筆鎖定的「正常」選項。
db.prepare(
  `
  INSERT INTO sop_performance (id, code, name, sortOrder, isActive, isLocked, createdAt, updatedAt)
  VALUES (@id, @code, @name, @sortOrder, 1, 1, @createdAt, @updatedAt)
  ON CONFLICT(code) DO NOTHING
`
).run({
  id: crypto.randomUUID(),
  code: "NORMAL_SOP",
  name: "正常",
  sortOrder: 0,
  createdAt: now(),
  updatedAt: now(),
});

console.log("seeded sop_performance「正常」option (idempotent).");
