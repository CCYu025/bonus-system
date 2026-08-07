import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import { queryScoresByMonth } from "./score-query";
import {
  approveForm,
  createDailyForm,
  rejectForm,
  saveFormRecords,
  submitForm,
  voidAndResubmitForm,
} from "./forms";
import { prisma } from "./prisma";

afterEach(async () => {
  await resetDb();
});

async function seedPerson(employeeId = "E001", name = "王小明") {
  return prisma.person.create({ data: { employeeId, name } });
}

async function seedCategory(
  code: string,
  name: string,
  opts: { locksExtendedFields?: boolean } = {}
) {
  return prisma.attendanceCategory.create({
    data: { code, name, locksExtendedFields: opts.locksExtendedFields ?? false },
  });
}

async function seedCategoryScoreRule(categoryId: string, points: number) {
  return prisma.categoryScoreRule.create({ data: { categoryId, points, updatedBy: "測試" } });
}

async function seedOvertimeScoreRule(input: {
  overtimeType: "weekday" | "holiday";
  minHours: number;
  maxHours: number | null;
  points: number;
  pointsPerExtraHour?: number | null;
  sortOrder?: number;
}) {
  return prisma.overtimeScoreRule.create({
    data: {
      overtimeType: input.overtimeType,
      minHours: input.minHours,
      maxHours: input.maxHours,
      points: input.points,
      pointsPerExtraHour: input.pointsPerExtraHour ?? null,
      sortOrder: input.sortOrder ?? 0,
      updatedBy: "測試",
    },
  });
}

// Builds an approved form for a date with the given employee/category/overtime assignments.
async function seedApprovedForm(
  date: string,
  assignments: {
    employeeId: string;
    categoryId: string;
    overtimeHours?: number;
    complianceRatingId?: string | null;
    threeSPerformanceId?: string | null;
    sopPerformanceId?: string | null;
  }[]
) {
  const form = await createDailyForm(date, "班長甲");
  await saveFormRecords(
    form.id,
    "班長甲",
    assignments.map((a) => ({
      employeeId: a.employeeId,
      categoryId: a.categoryId,
      overtimeHours: a.overtimeHours ?? null,
      complianceRatingId: a.complianceRatingId ?? null,
      threeSPerformanceId: a.threeSPerformanceId ?? null,
      sopPerformanceId: a.sopPerformanceId ?? null,
    }))
  );
  await submitForm(form.id, "班長甲");
  return approveForm(form.id, "主管");
}

async function seedComplianceRating(code = "CROSS_POST", name = "跨崗位", sortOrder = 1) {
  return prisma.complianceRating.create({ data: { code, name, sortOrder } });
}

async function seedComplianceRatingScoreRule(complianceRatingId: string, points: number) {
  return prisma.complianceRatingScoreRule.create({
    data: { complianceRatingId, points, updatedBy: "測試" },
  });
}

async function seedThreeSPerformance(code = "ABNORMAL", name = "異常", sortOrder = 1) {
  return prisma.threeSPerformance.create({ data: { code, name, sortOrder } });
}

async function seedThreeSPerformanceScoreRule(threeSPerformanceId: string, points: number) {
  return prisma.threeSPerformanceScoreRule.create({
    data: { threeSPerformanceId, points, updatedBy: "測試" },
  });
}

describe("queryScoresByMonth — 月份格式驗證", () => {
  it("rejects a missing or malformed month", async () => {
    await expect(queryScoresByMonth("")).rejects.toMatchObject({ status: 400 });
    await expect(queryScoresByMonth("2026-1")).rejects.toMatchObject({ status: 400 });
    await expect(queryScoresByMonth("2026-01-01")).rejects.toMatchObject({ status: 400 });
  });
});

describe("queryScoresByMonth — 出勤類別分（AC-2）", () => {
  it("takes CategoryScoreRule.points when a rule exists for the category", async () => {
    await seedPerson("E001", "王小明");
    const normal = await seedCategory("NORMAL", "正常出勤");
    await seedCategoryScoreRule(normal.id, 100);
    await seedApprovedForm("2026-01-05", [{ employeeId: "E001", categoryId: normal.id }]);

    const result = await queryScoresByMonth("2026-01");
    expect(result).toHaveLength(1);
    expect(result[0].categoryScore).toBe(100);
    expect(result[0].totalScore).toBe(100);
  });

  it("counts as 0 when no CategoryScoreRule exists for the category", async () => {
    await seedPerson("E001", "王小明");
    const leave = await seedCategory("PERSONAL_LEAVE", "事假", { locksExtendedFields: true });
    await seedApprovedForm("2026-01-05", [{ employeeId: "E001", categoryId: leave.id }]);

    const result = await queryScoresByMonth("2026-01");
    expect(result).toHaveLength(1);
    expect(result[0].categoryScore).toBe(0);
    expect(result[0].totalScore).toBe(0);
  });
});

describe("queryScoresByMonth — 加班分：正常出勤／平日（AC-3）", () => {
  it("applies the matching weekday tier by overtimeHours", async () => {
    await seedPerson("E001", "王小明");
    const normal = await seedCategory("NORMAL", "正常出勤");
    await seedOvertimeScoreRule({ overtimeType: "weekday", minHours: 2, maxHours: 2, points: 25 });
    await seedOvertimeScoreRule({ overtimeType: "weekday", minHours: 3, maxHours: null, points: 40 });
    await seedApprovedForm("2026-01-05", [
      { employeeId: "E001", categoryId: normal.id, overtimeHours: 2 },
    ]);

    const result = await queryScoresByMonth("2026-01");
    expect(result[0].overtimeScore).toBe(25);
  });

  it("applies the open-ended weekday tier for higher hour values", async () => {
    await seedPerson("E001", "王小明");
    const normal = await seedCategory("NORMAL", "正常出勤");
    await seedOvertimeScoreRule({ overtimeType: "weekday", minHours: 2, maxHours: 2, points: 25 });
    await seedOvertimeScoreRule({ overtimeType: "weekday", minHours: 3, maxHours: null, points: 40 });
    await seedApprovedForm("2026-01-05", [
      { employeeId: "E001", categoryId: normal.id, overtimeHours: 6 },
    ]);

    const result = await queryScoresByMonth("2026-01");
    expect(result[0].overtimeScore).toBe(40);
  });

  it("falls back to 0 when overtimeHours falls outside every configured tier", async () => {
    await seedPerson("E001", "王小明");
    const normal = await seedCategory("NORMAL", "正常出勤");
    // Only a 3+ hour tier configured — 1 hour matches nothing.
    await seedOvertimeScoreRule({ overtimeType: "weekday", minHours: 3, maxHours: null, points: 40 });
    await seedApprovedForm("2026-01-05", [
      { employeeId: "E001", categoryId: normal.id, overtimeHours: 1 },
    ]);

    const result = await queryScoresByMonth("2026-01");
    expect(result[0].overtimeScore).toBe(0);
  });
});

describe("queryScoresByMonth — 加班分：假日加班（AC-4）", () => {
  async function seedHolidayRules() {
    await seedOvertimeScoreRule({ overtimeType: "holiday", minHours: 4, maxHours: 7, points: 50, sortOrder: 1 });
    await seedOvertimeScoreRule({ overtimeType: "holiday", minHours: 8, maxHours: 8, points: 100, sortOrder: 2 });
    await seedOvertimeScoreRule({
      overtimeType: "holiday",
      minHours: 9,
      maxHours: null,
      points: 100,
      pointsPerExtraHour: 10,
      sortOrder: 3,
    });
  }

  it("applies the plain tier for hours within its range", async () => {
    await seedPerson("E001", "王小明");
    const holiday = await seedCategory("HOLIDAY_OVERTIME", "假日加班");
    await seedHolidayRules();
    await seedApprovedForm("2026-01-05", [
      { employeeId: "E001", categoryId: holiday.id, overtimeHours: 5 },
    ]);

    const result = await queryScoresByMonth("2026-01");
    expect(result[0].overtimeScore).toBe(50);
  });

  it("applies exactly 8 hours with no extra-hour bonus", async () => {
    await seedPerson("E001", "王小明");
    const holiday = await seedCategory("HOLIDAY_OVERTIME", "假日加班");
    await seedHolidayRules();
    await seedApprovedForm("2026-01-05", [
      { employeeId: "E001", categoryId: holiday.id, overtimeHours: 8 },
    ]);

    const result = await queryScoresByMonth("2026-01");
    expect(result[0].overtimeScore).toBe(100);
  });

  it("adds pointsPerExtraHour × (hours - 8) once past the 8-hour base (9h)", async () => {
    await seedPerson("E001", "王小明");
    const holiday = await seedCategory("HOLIDAY_OVERTIME", "假日加班");
    await seedHolidayRules();
    await seedApprovedForm("2026-01-05", [
      { employeeId: "E001", categoryId: holiday.id, overtimeHours: 9 },
    ]);

    const result = await queryScoresByMonth("2026-01");
    expect(result[0].overtimeScore).toBe(110); // 100 + 10 * (9 - 8)
  });

  it("adds pointsPerExtraHour × (hours - 8) for a larger value (12h)", async () => {
    await seedPerson("E001", "王小明");
    const holiday = await seedCategory("HOLIDAY_OVERTIME", "假日加班");
    await seedHolidayRules();
    await seedApprovedForm("2026-01-05", [
      { employeeId: "E001", categoryId: holiday.id, overtimeHours: 12 },
    ]);

    const result = await queryScoresByMonth("2026-01");
    expect(result[0].overtimeScore).toBe(140); // 100 + 10 * (12 - 8)
  });

  it("categoryScore stays 0 for 假日加班 since it never has a CategoryScoreRule row", async () => {
    await seedPerson("E001", "王小明");
    const holiday = await seedCategory("HOLIDAY_OVERTIME", "假日加班");
    await seedHolidayRules();
    await seedApprovedForm("2026-01-05", [
      { employeeId: "E001", categoryId: holiday.id, overtimeHours: 5 },
    ]);

    const result = await queryScoresByMonth("2026-01");
    expect(result[0].categoryScore).toBe(0);
    expect(result[0].totalScore).toBe(50);
  });
});

describe("queryScoresByMonth — 其他類別無加班分（AC-5）", () => {
  it("scores overtime as 0 for a leave-type category (overtimeHours stays null)", async () => {
    await seedPerson("E001", "王小明");
    const leave = await seedCategory("SICK_LEAVE", "病假", { locksExtendedFields: true });
    await seedCategoryScoreRule(leave.id, 10);
    await seedApprovedForm("2026-01-05", [{ employeeId: "E001", categoryId: leave.id }]);

    const result = await queryScoresByMonth("2026-01");
    expect(result[0].overtimeScore).toBe(0);
    expect(result[0].categoryScore).toBe(10);
  });
});

describe("queryScoresByMonth — 只計入核准且未作廢的紀錄（AC-6）", () => {
  it("excludes a form that is still pending_review", async () => {
    await seedPerson("E001", "王小明");
    const normal = await seedCategory("NORMAL", "正常出勤");
    await seedCategoryScoreRule(normal.id, 100);
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [{ employeeId: "E001", categoryId: normal.id }]);
    await submitForm(form.id, "班長甲");
    // never approved

    const result = await queryScoresByMonth("2026-01");
    expect(result[0].totalScore).toBe(0);
    expect(result[0].records).toHaveLength(0);
  });

  it("excludes a rejected form", async () => {
    await seedPerson("E001", "王小明");
    const normal = await seedCategory("NORMAL", "正常出勤");
    await seedCategoryScoreRule(normal.id, 100);
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [{ employeeId: "E001", categoryId: normal.id }]);
    await submitForm(form.id, "班長甲");
    await rejectForm(form.id, "主管", "重填");

    const result = await queryScoresByMonth("2026-01");
    expect(result[0].totalScore).toBe(0);
  });

  it("only counts the current live version after a void-and-resubmit cycle", async () => {
    await seedPerson("E001", "王小明");
    const normal = await seedCategory("NORMAL", "正常出勤");
    const leave = await seedCategory("PERSONAL_LEAVE", "事假", { locksExtendedFields: true });
    await seedCategoryScoreRule(normal.id, 100);
    await seedCategoryScoreRule(leave.id, 5);

    const approved = await seedApprovedForm("2026-01-01", [
      { employeeId: "E001", categoryId: normal.id },
    ]);
    const reviewed = await voidAndResubmitForm(approved!.id, "班長甲");
    await saveFormRecords(reviewed!.id, "班長甲", [{ employeeId: "E001", categoryId: leave.id }]);
    await submitForm(reviewed!.id, "班長甲");
    await approveForm(reviewed!.id, "主管");

    const result = await queryScoresByMonth("2026-01");
    expect(result).toHaveLength(1);
    expect(result[0].totalScore).toBe(5);
    expect(result[0].records).toHaveLength(1);
  });

  it("excludes 未填 records from an approved form", async () => {
    await seedPerson("E001", "王小明");
    await seedPerson("E002", "李小華");
    const normal = await seedCategory("NORMAL", "正常出勤");
    await seedCategoryScoreRule(normal.id, 100);
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [{ employeeId: "E001", categoryId: normal.id }]);
    // E002 stays 未填
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "主管");

    const result = await queryScoresByMonth("2026-01");
    const e002 = result.find((r) => r.employeeId === "E002");
    expect(e002?.totalScore).toBe(0);
    expect(e002?.records).toHaveLength(0);
  });
});

describe("queryScoresByMonth — 個人總分加總與明細排序（AC-7 / AC-9）", () => {
  it("sums categoryScore + overtimeScore across multiple records into totalScore, sorted by date", async () => {
    await seedPerson("E001", "王小明");
    const normal = await seedCategory("NORMAL", "正常出勤");
    await seedCategoryScoreRule(normal.id, 100);
    await seedOvertimeScoreRule({ overtimeType: "weekday", minHours: 2, maxHours: 2, points: 25 });

    await seedApprovedForm("2026-01-10", [
      { employeeId: "E001", categoryId: normal.id, overtimeHours: 2 },
    ]);
    await seedApprovedForm("2026-01-02", [{ employeeId: "E001", categoryId: normal.id }]);

    const result = await queryScoresByMonth("2026-01");
    expect(result[0].categoryScore).toBe(200);
    expect(result[0].overtimeScore).toBe(25);
    expect(result[0].totalScore).toBe(225);
    expect(result[0].records.map((r) => r.date)).toEqual(["2026-01-02", "2026-01-10"]);
    expect(result[0].records[1].subtotal).toBe(125);
  });
});

describe("queryScoresByMonth — 依總分排序（AC-8）", () => {
  it("sorts the summary list by totalScore descending", async () => {
    await seedPerson("E001", "王小明");
    await seedPerson("E002", "李小華");
    const normal = await seedCategory("NORMAL", "正常出勤");
    await seedCategoryScoreRule(normal.id, 100);
    await seedApprovedForm("2026-01-01", [
      { employeeId: "E001", categoryId: normal.id },
    ]);
    // E002 has no record this month → stays active, score 0.

    const result = await queryScoresByMonth("2026-01");
    expect(result.map((r) => r.employeeId)).toEqual(["E001", "E002"]);
  });
});

describe("queryScoresByMonth — 人員清單聯集（AC-10 / AC-11 / AC-12）", () => {
  it("still lists an active person with no records this month, scoring 0 (AC-10)", async () => {
    await seedPerson("E001", "王小明");

    const result = await queryScoresByMonth("2026-01");
    expect(result).toHaveLength(1);
    expect(result[0].employeeId).toBe("E001");
    expect(result[0].categoryScore).toBe(0);
    expect(result[0].overtimeScore).toBe(0);
    expect(result[0].totalScore).toBe(0);
  });

  it("lists a person terminated mid-month, scored from their earlier records (AC-11)", async () => {
    await seedPerson("E001", "王小明");
    const normal = await seedCategory("NORMAL", "正常出勤");
    await seedCategoryScoreRule(normal.id, 100);
    await seedApprovedForm("2026-01-05", [{ employeeId: "E001", categoryId: normal.id }]);

    await prisma.person.update({ where: { employeeId: "E001" }, data: { status: "terminated" } });

    const result = await queryScoresByMonth("2026-01");
    expect(result).toHaveLength(1);
    expect(result[0].totalScore).toBe(100);
  });

  it("excludes a person terminated in an earlier month with no records this month (AC-12)", async () => {
    await seedPerson("E001", "王小明"); // will be terminated before January
    await seedPerson("E002", "李小華"); // stays active through January

    const normal = await seedCategory("NORMAL", "正常出勤");
    await seedCategoryScoreRule(normal.id, 100);
    // E001 has a December record while still active.
    await seedApprovedForm("2025-12-15", [{ employeeId: "E001", categoryId: normal.id }]);
    await prisma.person.update({ where: { employeeId: "E001" }, data: { status: "terminated" } });

    // Only E002 gets a January form (E001 is no longer active when this is created).
    await seedApprovedForm("2026-01-10", [{ employeeId: "E002", categoryId: normal.id }]);

    const result = await queryScoresByMonth("2026-01");
    expect(result.map((r) => r.employeeId)).toEqual(["E002"]);
  });
});

describe("queryScoresByMonth — 配合度／3S表現／SOP表現積分（docs/2026-08-06-score-rules-lookup-scoring AC-10）", () => {
  it("sums compliance/3S points and counts an unfilled SOP field as 0, into totalScore", async () => {
    await seedPerson("E001", "王小明");
    const normal = await seedCategory("NORMAL", "正常出勤");
    const compliance = await seedComplianceRating();
    await seedComplianceRatingScoreRule(compliance.id, 10);
    const threeS = await seedThreeSPerformance();
    await seedThreeSPerformanceScoreRule(threeS.id, 5);

    await seedApprovedForm("2026-01-05", [
      {
        employeeId: "E001",
        categoryId: normal.id,
        complianceRatingId: compliance.id,
        threeSPerformanceId: threeS.id,
        // sopPerformanceId 刻意不帶（未填寫）
      },
    ]);

    const result = await queryScoresByMonth("2026-01");
    expect(result[0].complianceScore).toBe(10);
    expect(result[0].threeSScore).toBe(5);
    expect(result[0].sopScore).toBe(0);
    expect(result[0].totalScore).toBe(15);
    expect(result[0].records[0]).toMatchObject({
      complianceRatingPoints: 10,
      threeSPerformancePoints: 5,
      sopPerformancePoints: 0,
      subtotal: 15,
    });
  });
});

describe("queryScoresByMonth — 未設定積分的項目計為 0 分（docs/2026-08-06-score-rules-lookup-scoring AC-11）", () => {
  it("counts a 3S performance item with no score rule set as 0 points", async () => {
    await seedPerson("E001", "王小明");
    const normal = await seedCategory("NORMAL", "正常出勤");
    const threeS = await seedThreeSPerformance("ABNORMAL", "異常");
    // 刻意不呼叫 seedThreeSPerformanceScoreRule——項目存在但未設定積分。

    await seedApprovedForm("2026-01-05", [
      { employeeId: "E001", categoryId: normal.id, threeSPerformanceId: threeS.id },
    ]);

    const result = await queryScoresByMonth("2026-01");
    expect(result[0].threeSScore).toBe(0);
    expect(result[0].totalScore).toBe(0);
  });
});
