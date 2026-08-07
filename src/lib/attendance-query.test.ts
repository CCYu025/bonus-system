import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import { queryAttendanceByMonth } from "./attendance-query";
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
  code = "OT",
  name = "加班",
  opts: { locksExtendedFields?: boolean } = {}
) {
  return prisma.attendanceCategory.create({
    data: { code, name, locksExtendedFields: opts.locksExtendedFields ?? false },
  });
}

async function seedComplianceRating(code = "CROSS_POST", name = "跨崗位") {
  return prisma.complianceRating.create({ data: { code, name, sortOrder: 1 } });
}

async function seedThreeSPerformance(code = "NORMAL_3S", name = "正常") {
  return prisma.threeSPerformance.create({ data: { code, name, sortOrder: 1 } });
}

async function seedSopPerformance(code = "NORMAL_SOP", name = "正常") {
  return prisma.sopPerformance.create({ data: { code, name, sortOrder: 1 } });
}

// Builds an approved form for a date with the given employee/category assignments.
async function seedApprovedForm(
  date: string,
  assignments: { employeeId: string; categoryId: string; note?: string }[]
) {
  const form = await createDailyForm(date, "班長甲");
  await saveFormRecords(
    form.id,
    "班長甲",
    assignments.map((a) => ({ employeeId: a.employeeId, categoryId: a.categoryId, note: a.note }))
  );
  await submitForm(form.id, "班長甲");
  return approveForm(form.id, "主管");
}

describe("queryAttendanceByMonth", () => {
  // AC-1
  it("returns every approved record within the month, sorted by date", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    await seedApprovedForm("2026-01-05", [{ employeeId: "E001", categoryId: category.id }]);
    await seedApprovedForm("2026-01-01", [{ employeeId: "E001", categoryId: category.id }]);

    const result = await queryAttendanceByMonth("2026-01");

    expect(result.map((r) => r.date)).toEqual(["2026-01-01", "2026-01-05"]);
    expect(result.every((r) => r.categoryName === "加班")).toBe(true);
  });

  // month-boundary: adjacent months must not leak in
  it("excludes records outside the requested month, including adjacent months", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    await seedApprovedForm("2025-12-31", [{ employeeId: "E001", categoryId: category.id }]);
    await seedApprovedForm("2026-01-15", [{ employeeId: "E001", categoryId: category.id }]);
    await seedApprovedForm("2026-02-01", [{ employeeId: "E001", categoryId: category.id }]);

    const result = await queryAttendanceByMonth("2026-01");

    expect(result.map((r) => r.date)).toEqual(["2026-01-15"]);
  });

  // AC-6
  it("excludes pending/draft/rejected forms within the month", async () => {
    await seedPerson("E001", "王小明");
    const form = await createDailyForm("2026-01-01", "班長甲");
    await submitForm(form.id, "班長甲");
    // still pending_review, never approved

    const result = await queryAttendanceByMonth("2026-01");
    expect(result).toEqual([]);
  });

  // AC-8
  it("still returns a terminated person's records within the month", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    await seedApprovedForm("2026-01-01", [{ employeeId: "E001", categoryId: category.id }]);
    await prisma.person.update({ where: { employeeId: "E001" }, data: { status: "terminated" } });

    const result = await queryAttendanceByMonth("2026-01");
    expect(result).toHaveLength(1);
  });

  // AC-5 / NFR-1: the highest-risk case — void-and-resubmit must not double count.
  it("only counts the current live version after a void-and-resubmit cycle", async () => {
    await seedPerson("E001", "王小明");
    const categoryA = await seedCategory("OT", "加班");
    const categoryB = await seedCategory("LEAVE", "請假");

    const approved = await seedApprovedForm("2026-01-01", [
      { employeeId: "E001", categoryId: categoryA.id },
    ]);
    const reviewed = await voidAndResubmitForm(approved!.id, "班長甲");
    await saveFormRecords(reviewed!.id, "班長甲", [
      { employeeId: "E001", categoryId: categoryB.id },
    ]);
    await submitForm(reviewed!.id, "班長甲");
    await approveForm(reviewed!.id, "主管");

    const result = await queryAttendanceByMonth("2026-01");
    expect(result).toHaveLength(1);
    expect(result[0].categoryName).toBe("請假");
  });

  it("rejects a missing or malformed month", async () => {
    await expect(queryAttendanceByMonth("")).rejects.toMatchObject({ status: 400 });
    await expect(queryAttendanceByMonth("2026-1")).rejects.toMatchObject({ status: 400 });
    await expect(queryAttendanceByMonth("2026-01-01")).rejects.toMatchObject({ status: 400 });
  });

  // AC-2 (spec 2026-07-31-attendance-exclude-unfilled): an approved form can still
  // contain 未填 people (submit/approve are not blocked by completeness); those
  // records must not show up in the query results or count toward any subtotal.
  it("excludes 未填 records from an approved form's results", async () => {
    await seedPerson("E001", "王小明");
    await seedPerson("E002", "李小華");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id },
    ]);
    // E002 stays 未填
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "主管");

    const result = await queryAttendanceByMonth("2026-01");
    expect(result.map((r) => r.employeeId)).toEqual(["E001"]);
  });

  // AC-6: a person left 未填 in an approved form, then filled in after a
  // void-and-resubmit cycle, must show up normally once re-approved.
  it("includes a person after their previously-未填 record is filled in via void-and-resubmit", async () => {
    await seedPerson("E001", "王小明");
    await seedPerson("E002", "李小華");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id },
    ]);
    // E002 stays 未填, but the form still gets submitted and approved
    await submitForm(form.id, "班長甲");
    const approved = await approveForm(form.id, "主管");

    expect((await queryAttendanceByMonth("2026-01")).map((r) => r.employeeId)).toEqual(["E001"]);

    const reviewed = await voidAndResubmitForm(approved!.id, "班長甲");
    await saveFormRecords(reviewed!.id, "班長甲", [
      { employeeId: "E002", categoryId: category.id },
    ]);
    await submitForm(reviewed!.id, "班長甲");
    await approveForm(reviewed!.id, "主管");

    const result = await queryAttendanceByMonth("2026-01");
    expect(result.map((r) => r.employeeId).sort()).toEqual(["E001", "E002"]);
  });

  // AC-5: a person left 未填 in a form that gets rejected, then filled in after
  // rejection and resubmitted, must show up normally once approved — the
  // reject-path counterpart to the void-and-resubmit test above.
  it("includes a person after their previously-未填 record is filled in following a rejection", async () => {
    await seedPerson("E001", "王小明");
    await seedPerson("E002", "李小華");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id },
    ]);
    // E002 stays 未填 through the first submit/reject cycle
    await submitForm(form.id, "班長甲");
    await rejectForm(form.id, "主管", "E002 尚未填寫");

    await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E002", categoryId: category.id },
    ]);
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "主管");

    const result = await queryAttendanceByMonth("2026-01");
    expect(result.map((r) => r.employeeId).sort()).toEqual(["E001", "E002"]);
  });
});

describe("擴充欄位（實際產量／加班時數／配合度／3S表現／SOP表現）(spec 2026-08-07-attendance-query-extended-fields)", () => {
  // AC-1
  it("returns the actualQuantity value when filled (AC-1)", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id, actualQuantity: 42 },
    ]);
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "主管");

    const result = await queryAttendanceByMonth("2026-01");
    expect(result[0].actualQuantity).toBe(42);
  });

  // AC-2
  it("returns the overtimeHours value when filled (AC-2)", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id, overtimeHours: 3 },
    ]);
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "主管");

    const result = await queryAttendanceByMonth("2026-01");
    expect(result[0].overtimeHours).toBe(3);
  });

  // AC-3
  it("returns the compliance rating name when set (AC-3)", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const compliance = await seedComplianceRating();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id, complianceRatingId: compliance.id },
    ]);
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "主管");

    const result = await queryAttendanceByMonth("2026-01");
    expect(result[0].complianceRatingName).toBe("跨崗位");
  });

  // AC-4
  it("returns the 3S performance name when set (AC-4)", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const threeS = await seedThreeSPerformance();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id, threeSPerformanceId: threeS.id },
    ]);
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "主管");

    const result = await queryAttendanceByMonth("2026-01");
    expect(result[0].threeSPerformanceName).toBe("正常");
  });

  // AC-5
  it("returns the SOP performance name when set (AC-5)", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const sop = await seedSopPerformance();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id, sopPerformanceId: sop.id },
    ]);
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "主管");

    const result = await queryAttendanceByMonth("2026-01");
    expect(result[0].sopPerformanceName).toBe("正常");
  });

  // AC-6
  it("returns null for all five extended fields when left unfilled (AC-6)", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    await seedApprovedForm("2026-01-01", [{ employeeId: "E001", categoryId: category.id }]);

    const result = await queryAttendanceByMonth("2026-01");
    expect(result[0]).toMatchObject({
      actualQuantity: null,
      overtimeHours: null,
      complianceRatingName: null,
      threeSPerformanceName: null,
      sopPerformanceName: null,
    });
  });

  // AC-7
  it("returns null for all five extended fields when the category locks them, even if values were submitted (AC-7)", async () => {
    await seedPerson("E001", "王小明");
    const leave = await seedCategory("PERSONAL_LEAVE", "事假", { locksExtendedFields: true });
    const compliance = await seedComplianceRating();
    const threeS = await seedThreeSPerformance();
    const sop = await seedSopPerformance();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      {
        employeeId: "E001",
        categoryId: leave.id,
        actualQuantity: 5,
        overtimeHours: 2,
        complianceRatingId: compliance.id,
        threeSPerformanceId: threeS.id,
        sopPerformanceId: sop.id,
      },
    ]);
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "主管");

    const result = await queryAttendanceByMonth("2026-01");
    expect(result[0]).toMatchObject({
      actualQuantity: null,
      overtimeHours: null,
      complianceRatingName: null,
      threeSPerformanceName: null,
      sopPerformanceName: null,
    });
  });
});

describe("工號更正後查詢結果即時反映新值 (spec 2026-07-31-attendance-record-personid-migration AC-4)", () => {
  it("shows the corrected employeeId for historical approved records", async () => {
    const person = await seedPerson("E001", "王小明");
    const category = await seedCategory();
    await seedApprovedForm("2026-01-01", [{ employeeId: "E001", categoryId: category.id }]);

    // AttendanceRecord is keyed by personId, not employeeId — correcting the
    // typo on Person should not require touching any AttendanceRecord row.
    await prisma.person.update({ where: { id: person.id }, data: { employeeId: "E999" } });

    const result = await queryAttendanceByMonth("2026-01");
    expect(result).toHaveLength(1);
    expect(result[0].employeeId).toBe("E999");
  });
});
