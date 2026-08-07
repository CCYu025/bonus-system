import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { isFilledRecord } from "@/lib/attendance-records";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

// 出勤類別代碼，對應 scripts/seed.cjs 固定 seed 的 code——只有這兩個類別的
// overtimeHours 才會有值（其餘類別因 locksExtendedFields 而強制為 null，見
// src/lib/forms.ts saveFormRecords），分別對應平日/假日加班級距（spec AC-3/AC-4）。
const NORMAL_CATEGORY_CODE = "NORMAL";
const HOLIDAY_OVERTIME_CATEGORY_CODE = "HOLIDAY_OVERTIME";

// 假日加班「超過 8 小時」級距的加成基準固定為 8（plan.md 技術決策記錄第 2 項）：
// spec AC-4 字面寫「超過 8 小時」，不是「超過該級距下限」，即使未來 seed 調整
// minHours 也不應悄悄跟著改變這個基準。
const HOLIDAY_EXTRA_HOUR_BASE = 8;

export type ScoreRecordDetail = {
  date: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryPoints: number;
  overtimeHours: number | null;
  overtimePoints: number;
  complianceRatingPoints: number;
  threeSPerformancePoints: number;
  sopPerformancePoints: number;
  subtotal: number;
};

export type PersonScoreSummary = {
  employeeId: string;
  personName: string;
  categoryScore: number;
  overtimeScore: number;
  complianceScore: number;
  threeSScore: number;
  sopScore: number;
  totalScore: number;
  records: ScoreRecordDetail[];
};

// T-1～T-6：依「年月」即時計算每位人員的出勤類別分／加班分／總分，不落地儲存
// （NFR-1）。只計入 status="approved" 且 activeDateKey 非 null 的現行生效表單、
// 且未作廢（voided=false）、且已填寫（isFilledRecord）的紀錄（AC-6），邏輯與
// src/lib/attendance-query.ts 的既有查詢模式一致。
export async function queryScoresByMonth(month: string): Promise<PersonScoreSummary[]> {
  if (!month || !MONTH_PATTERN.test(month)) {
    throw new AppError(400, "請提供正確的年月格式（YYYY-MM）");
  }

  const [
    forms,
    categoryScoreRules,
    overtimeScoreRules,
    complianceRatingScoreRules,
    threeSPerformanceScoreRules,
    sopPerformanceScoreRules,
    activePersons,
  ] = await Promise.all([
    prisma.attendanceForm.findMany({
      where: {
        status: "approved",
        activeDateKey: { not: null },
        date: { startsWith: `${month}-` },
      },
      include: {
        records: {
          where: { voided: false },
          include: { person: true, category: true },
        },
      },
    }),
    prisma.categoryScoreRule.findMany(),
    prisma.overtimeScoreRule.findMany(),
    // docs/2026-08-06-score-rules-lookup-scoring：比照既有 categoryScoreRules 的
    // 查詢與加總方式，逐筆讀取三個規則表（不經過各自的 isActive 過濾清單函式，
    // 停用項目先前設定的積分仍要生效，見 plan.md 技術決策記錄 3）。
    prisma.complianceRatingScoreRule.findMany(),
    prisma.threeSPerformanceScoreRule.findMany(),
    prisma.sopPerformanceScoreRule.findMany(),
    // T-2：人員清單聯集的第一半——目前在職的所有人員，即使當月無任何合格紀錄
    // 也要出現（AC-10）。第二半（當月才離職但當月有合格紀錄的人員，AC-11）
    // 靠下面逐筆處理紀錄時「查無現有 summary 就建立」自然涵蓋，不需要另外查
        // Person.status="terminated"——見 plan.md 技術決策記錄第 4 項。
    prisma.person.findMany({ where: { status: "active" } }),
  ]);

  const categoryPointsMap = new Map(categoryScoreRules.map((r) => [r.categoryId, r.points]));
  const complianceRatingPointsMap = new Map(
    complianceRatingScoreRules.map((r) => [r.complianceRatingId, r.points])
  );
  const threeSPerformancePointsMap = new Map(
    threeSPerformanceScoreRules.map((r) => [r.threeSPerformanceId, r.points])
  );
  const sopPerformancePointsMap = new Map(
    sopPerformanceScoreRules.map((r) => [r.sopPerformanceId, r.points])
  );

  // T-3/T-4/T-5：依出勤類別分/加班分規則計算單筆紀錄的兩個分數。
  function categoryPointsFor(categoryId: string | null): number {
    if (categoryId === null) return 0;
    return categoryPointsMap.get(categoryId) ?? 0;
  }

  // 配合度／3S表現／SOP表現：未填寫（null）或查無規則（未設定積分）皆計為 0 分，
  // 是同一段邏輯的兩種觸發條件，不需分開處理（AC-10 的未填寫與 AC-11 的未設定積分）。
  function complianceRatingPointsFor(complianceRatingId: string | null): number {
    if (complianceRatingId === null) return 0;
    return complianceRatingPointsMap.get(complianceRatingId) ?? 0;
  }

  function threeSPerformancePointsFor(threeSPerformanceId: string | null): number {
    if (threeSPerformanceId === null) return 0;
    return threeSPerformancePointsMap.get(threeSPerformanceId) ?? 0;
  }

  function sopPerformancePointsFor(sopPerformanceId: string | null): number {
    if (sopPerformanceId === null) return 0;
    return sopPerformancePointsMap.get(sopPerformanceId) ?? 0;
  }

  function overtimeTierPoints(overtimeType: "weekday" | "holiday", hours: number): number {
    const tier = overtimeScoreRules.find(
      (r) =>
        r.overtimeType === overtimeType &&
        r.minHours <= hours &&
        (r.maxHours === null || r.maxHours >= hours)
    );
    if (!tier) return 0;
    let points = tier.points;
    if (tier.pointsPerExtraHour !== null && hours > HOLIDAY_EXTRA_HOUR_BASE) {
      points += tier.pointsPerExtraHour * (hours - HOLIDAY_EXTRA_HOUR_BASE);
    }
    return points;
  }

  function overtimePointsFor(categoryCode: string | undefined, hours: number | null): number {
    if (hours === null) return 0;
    if (categoryCode === NORMAL_CATEGORY_CODE) return overtimeTierPoints("weekday", hours);
    if (categoryCode === HOLIDAY_OVERTIME_CATEGORY_CODE) return overtimeTierPoints("holiday", hours);
    return 0;
  }

  const summaries = new Map<string, PersonScoreSummary>();

  function ensureSummary(personId: string, employeeId: string, personName: string) {
    let summary = summaries.get(personId);
    if (!summary) {
      summary = {
        employeeId,
        personName,
        categoryScore: 0,
        overtimeScore: 0,
        complianceScore: 0,
        threeSScore: 0,
        sopScore: 0,
        totalScore: 0,
        records: [],
      };
      summaries.set(personId, summary);
    }
    return summary;
  }

  // T-2：清單聯集的第一半——在職人員先建立好 0 分的彙總項，即使當月完全沒有
  // 合格紀錄也會出現（AC-10）。
  for (const person of activePersons) {
    ensureSummary(person.id, person.employeeId, person.name);
  }

  // T-2 + T-6：逐筆合格紀錄計分並彙總。清單聯集的第二半——當月才離職的人員
  // （status 已是 terminated，不在 activePersons 裡）第一次在這裡出現時
  // ensureSummary 會建立新項目，天然滿足 AC-11；更早月份離職的人員因為當月
  // 沒有任何合格紀錄，兩邊都不會建立項目，自然不出現（AC-12）。
  for (const form of forms) {
    for (const record of form.records) {
      if (!isFilledRecord(record)) continue;

      const summary = ensureSummary(record.personId, record.person.employeeId, record.person.name);

      const categoryPoints = categoryPointsFor(record.categoryId);
      const overtimePoints = overtimePointsFor(record.category?.code, record.overtimeHours);
      const complianceRatingPoints = complianceRatingPointsFor(record.complianceRatingId);
      const threeSPerformancePoints = threeSPerformancePointsFor(record.threeSPerformanceId);
      const sopPerformancePoints = sopPerformancePointsFor(record.sopPerformanceId);
      const subtotal =
        categoryPoints +
        overtimePoints +
        complianceRatingPoints +
        threeSPerformancePoints +
        sopPerformancePoints;

      summary.categoryScore += categoryPoints;
      summary.overtimeScore += overtimePoints;
      summary.complianceScore += complianceRatingPoints;
      summary.threeSScore += threeSPerformancePoints;
      summary.sopScore += sopPerformancePoints;
      summary.totalScore += subtotal;
      summary.records.push({
        date: form.date,
        categoryId: record.categoryId,
        categoryName: record.category?.name ?? null,
        categoryPoints,
        overtimeHours: record.overtimeHours,
        overtimePoints,
        complianceRatingPoints,
        threeSPerformancePoints,
        sopPerformancePoints,
        subtotal,
      });
    }
  }

  const result = Array.from(summaries.values());
  // AC-9：明細依日期由舊到新排序。
  for (const summary of result) {
    summary.records.sort((a, b) => a.date.localeCompare(b.date));
  }
  // AC-8：彙總列表依總分由高到低排序。
  result.sort((a, b) => b.totalScore - a.totalScore);

  return result;
}
