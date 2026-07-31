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

async function seedCategory(code = "OT", name = "加班") {
  return prisma.attendanceCategory.create({ data: { code, name } });
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
