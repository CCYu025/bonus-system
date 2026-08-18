const crypto = require("node:crypto");
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const now = () => new Date();

  const categories = [
    { code: "NORMAL", name: "正常出勤", sortOrder: 1 },
    { code: "PERSONAL_LEAVE", name: "事假", sortOrder: 2 },
    { code: "SICK_LEAVE", name: "病假", sortOrder: 3 },
    { code: "ANNUAL_LEAVE", name: "特休", sortOrder: 4 },
    { code: "HOLIDAY_OVERTIME", name: "假日加班", sortOrder: 5 },
  ];

  for (const c of categories) {
    await client.query(
      `INSERT INTO attendance_category (id, code, name, "sortOrder", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, true, $5, $5)
       ON CONFLICT (code) DO NOTHING`,
      [crypto.randomUUID(), c.code, c.name, c.sortOrder, now()]
    );
  }

  console.log("seeded attendance_category (idempotent).");

  // docs/2026-08-03-attendance-leave-lock-sop-field：事假／病假／特休鎖定加班時數／
  // 配合度／3S表現／SOP表現／實際產量（備註不受影響）。其餘既有類別維持預設 false。
  await client.query(
    `UPDATE attendance_category
     SET "locksExtendedFields" = true
     WHERE code IN ('PERSONAL_LEAVE', 'SICK_LEAVE', 'ANNUAL_LEAVE')`
  );

  console.log("marked leave categories as locksExtendedFields (idempotent).");

  // 3S表現的「正常」預設選項：這是既有開放 CRUD 清單，可能已經有人透過畫面手動
  // 建立過同名選項（且已被既有記錄引用）——先查再決定 update 既有列或 insert 新列，
  // 避免清單裡出現兩筆「正常」（詳見 docs/2026-08-03-attendance-leave-lock-sop-field/plan.md T-1）。
  const existingNormal3s = await client.query(
    `SELECT id FROM three_s_performance WHERE name = '正常'`
  );

  if (existingNormal3s.rows.length > 0) {
    await client.query(
      `UPDATE three_s_performance SET "isLocked" = true WHERE id = $1`,
      [existingNormal3s.rows[0].id]
    );
    console.log("locked existing 3S表現「正常」option.");
  } else {
    await client.query(
      `INSERT INTO three_s_performance (id, code, name, "sortOrder", "isActive", "isLocked", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, true, true, $5, $5)
       ON CONFLICT (code) DO NOTHING`,
      [crypto.randomUUID(), "NORMAL_3S", "正常", 0, now()]
    );
    console.log("seeded new 3S表現「正常」option.");
  }

  // SOP表現是全新清單，沒有既有資料，直接塞一筆鎖定的「正常」選項。
  await client.query(
    `INSERT INTO sop_performance (id, code, name, "sortOrder", "isActive", "isLocked", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, true, true, $5, $5)
     ON CONFLICT (code) DO NOTHING`,
    [crypto.randomUUID(), "NORMAL_SOP", "正常", 0, now()]
  );

  console.log("seeded sop_performance「正常」option (idempotent).");

  // 加班積分規則（docs/2026-08-04-attendance-scoring-rules FR-7）：平日/假日兩組
  // 互斥時數級距，固定值，冪等 seed。不 seed category_score_rule——「未設定」是
  // 出勤類別積分的合法初始狀態（AC-3），不能預塞任何值。
  const overtimeRules = [
    { overtimeType: "weekday", minHours: 2, maxHours: 2, points: 25, pointsPerExtraHour: null, sortOrder: 1 },
    { overtimeType: "weekday", minHours: 3, maxHours: null, points: 40, pointsPerExtraHour: null, sortOrder: 2 },
    { overtimeType: "holiday", minHours: 4, maxHours: 7, points: 50, pointsPerExtraHour: null, sortOrder: 1 },
    { overtimeType: "holiday", minHours: 8, maxHours: 8, points: 100, pointsPerExtraHour: null, sortOrder: 2 },
    { overtimeType: "holiday", minHours: 9, maxHours: null, points: 100, pointsPerExtraHour: 10, sortOrder: 3 },
  ];

  const existingOvertimeRuleCount = await client.query(
    `SELECT COUNT(*) AS c FROM overtime_score_rule`
  );

  if (Number(existingOvertimeRuleCount.rows[0].c) === 0) {
    for (const r of overtimeRules) {
      await client.query(
        `INSERT INTO overtime_score_rule
           (id, "overtimeType", "minHours", "maxHours", points, "pointsPerExtraHour", "sortOrder", "updatedBy", "createdAt", "updatedAt")
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
        [
          crypto.randomUUID(),
          r.overtimeType,
          r.minHours,
          r.maxHours,
          r.points,
          r.pointsPerExtraHour,
          r.sortOrder,
          "system-seed",
          now(),
        ]
      );
    }
    console.log("seeded overtime_score_rule (idempotent).");
  } else {
    console.log("overtime_score_rule already seeded, skipping.");
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
