import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import {
  approveForm,
  createDailyForm,
  findActiveFormByDate,
  getFormWithRecords,
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

async function seedComplianceRating(code = "CROSS", name = "跨崗位") {
  return prisma.complianceRating.create({ data: { code, name } });
}

async function seedThreeSPerformance(code = "NORMAL", name = "正常") {
  return prisma.threeSPerformance.create({ data: { code, name } });
}

async function seedSopPerformance(code = "NORMAL", name = "正常") {
  return prisma.sopPerformance.create({ data: { code, name } });
}

// docs/2026-08-03-attendance-leave-lock-sop-field：請假鎖定類（例如事假）。
async function seedLeaveCategory(code = "PERSONAL_LEAVE", name = "事假") {
  return prisma.attendanceCategory.create({
    data: { code, name, locksExtendedFields: true },
  });
}

async function seedLockedThreeSPerformance(code = "NORMAL", name = "正常") {
  return prisma.threeSPerformance.create({ data: { code, name, isLocked: true } });
}

async function seedLockedSopPerformance(code = "NORMAL", name = "正常") {
  return prisma.sopPerformance.create({ data: { code, name, isLocked: true } });
}

describe("createDailyForm", () => {
  // AC-4 / T-6
  it("creates a draft with every active person defaulted to 未填, and logs 'created'", async () => {
    await seedPerson("E001", "王小明");
    await seedPerson("E002", "李小華");

    const form = await createDailyForm("2026-01-01", "班長甲");

    const withRecords = await prisma.attendanceForm.findUnique({
      where: { id: form.id },
      include: { records: true, auditLogs: true },
    });
    expect(withRecords?.status).toBe("draft");
    expect(withRecords?.records).toHaveLength(2);
    expect(withRecords?.records.every((r) => r.categoryId === null)).toBe(true);
    expect(
      withRecords?.records.every(
        (r) =>
          r.overtimeHours === null &&
          r.complianceRatingId === null &&
          r.threeSPerformanceId === null &&
          r.actualQuantity === null
      )
    ).toBe(true);
    expect(withRecords?.auditLogs.map((l) => l.action)).toEqual(["created"]);
  });

  it("returns the existing form instead of duplicating it for the same date", async () => {
    await seedPerson();
    const first = await createDailyForm("2026-01-01", "班長甲");
    const second = await createDailyForm("2026-01-01", "班長乙");

    expect(second.id).toBe(first.id);
    const count = await prisma.attendanceForm.count({ where: { date: "2026-01-01" } });
    expect(count).toBe(1);
  });

  it("rejects a missing date or operator name", async () => {
    await expect(createDailyForm("", "班長甲")).rejects.toMatchObject({ status: 400 });
    await expect(createDailyForm("2026-01-01", "  ")).rejects.toMatchObject({ status: 400 });
  });
});

describe("saveFormRecords", () => {
  // T-7 / AC-11
  it("upserts only the changed rows and logs 'saved_draft'", async () => {
    await seedPerson("E001", "王小明");
    await seedPerson("E002", "李小華");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");

    const updated = await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id, note: "備註" },
    ]);

    const e001 = updated?.records.find((r) => r.employeeId === "E001");
    const e002 = updated?.records.find((r) => r.employeeId === "E002");
    expect(e001?.categoryId).toBe(category.id);
    expect(e001?.note).toBe("備註");
    expect(e002?.categoryId).toBeNull();

    const logs = await prisma.auditLog.findMany({ where: { formId: form.id } });
    expect(logs.map((l) => l.action)).toEqual(["created", "saved_draft"]);
  });

  it("rejects edits once the form is approved", async () => {
    await seedPerson();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "主管");

    await expect(
      saveFormRecords(form.id, "班長甲", [{ employeeId: "E001", categoryId: null }])
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a change for an employee not on the form", async () => {
    await seedPerson();
    const form = await createDailyForm("2026-01-01", "班長甲");

    await expect(
      saveFormRecords(form.id, "班長甲", [{ employeeId: "NOT_ON_FORM", categoryId: null }])
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects an empty change list", async () => {
    await seedPerson();
    const form = await createDailyForm("2026-01-01", "班長甲");

    await expect(saveFormRecords(form.id, "班長甲", [])).rejects.toMatchObject({ status: 400 });
  });
});

describe("submitForm", () => {
  // AC-5 / T-8
  it("moves a draft to pending_review", async () => {
    await seedPerson();
    const form = await createDailyForm("2026-01-01", "班長甲");

    const submitted = await submitForm(form.id, "班長甲");
    expect(submitted?.status).toBe("pending_review");
  });

  it("allows resubmitting a rejected form and clears the reject reason", async () => {
    await seedPerson();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await submitForm(form.id, "班長甲");
    await rejectForm(form.id, "主管", "資料有誤");

    const resubmitted = await submitForm(form.id, "班長甲");
    expect(resubmitted?.status).toBe("pending_review");
    expect(resubmitted?.rejectReason).toBeNull();
  });

  it("rejects submitting a form that is not draft/rejected", async () => {
    await seedPerson();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "主管");

    await expect(submitForm(form.id, "班長甲")).rejects.toMatchObject({ status: 409 });
  });
});

describe("approveForm / rejectForm", () => {
  // AC-6 / T-10
  it("approves a pending_review form", async () => {
    await seedPerson();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await submitForm(form.id, "班長甲");

    const approved = await approveForm(form.id, "主管");
    expect(approved?.status).toBe("approved");
  });

  it("rejects approving a form that is not pending_review", async () => {
    await seedPerson();
    const form = await createDailyForm("2026-01-01", "班長甲");

    await expect(approveForm(form.id, "主管")).rejects.toMatchObject({ status: 409 });
  });

  // AC-7 / T-11
  it("rejects a pending_review form with a reason", async () => {
    await seedPerson();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await submitForm(form.id, "班長甲");

    const rejected = await rejectForm(form.id, "主管", "資料有誤");
    expect(rejected?.status).toBe("rejected");
    expect(rejected?.rejectReason).toBe("資料有誤");
  });

  it("rejects retracting a form that is not pending_review", async () => {
    await seedPerson();
    const form = await createDailyForm("2026-01-01", "班長甲");

    await expect(rejectForm(form.id, "主管", "理由")).rejects.toMatchObject({ status: 409 });
  });
});

describe("voidAndResubmitForm", () => {
  // AC-10 / T-14
  it("voids the approved form and creates a linked, incremented draft with the same records", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id, note: "原始備註" },
    ]);
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "主管");

    const newForm = await voidAndResubmitForm(form.id, "班長甲");

    const oldForm = await prisma.attendanceForm.findUnique({ where: { id: form.id } });
    expect(oldForm?.status).toBe("voided");
    expect(oldForm?.activeDateKey).toBeNull();

    expect(newForm?.status).toBe("draft");
    expect(newForm?.version).toBe(2);
    expect(newForm?.previousFormId).toBe(form.id);
    expect(newForm?.activeDateKey).toBe("2026-01-01");
    const newE001 = newForm?.records.find((r) => r.employeeId === "E001");
    expect(newE001?.categoryId).toBe(category.id);
    expect(newE001?.note).toBe("原始備註");

    // the date is "freed" from the voided form so the new draft can own it
    const active = await findActiveFormByDate("2026-01-01");
    expect(active?.id).toBe(newForm?.id);
  });

  it("rejects voiding a form that is not approved", async () => {
    await seedPerson();
    const form = await createDailyForm("2026-01-01", "班長甲");

    await expect(voidAndResubmitForm(form.id, "班長甲")).rejects.toMatchObject({ status: 409 });
  });
});

describe("getFormWithRecords — 未填人員的顯示排除 (spec 2026-07-31-attendance-exclude-unfilled)", () => {
  // AC-1
  it("excludes unfilled records once the form is pending_review", async () => {
    await seedPerson("E001", "王小明");
    await seedPerson("E002", "李小華");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id },
    ]);
    // E002 stays 未填 on purpose

    const submitted = await submitForm(form.id, "班長甲");
    expect(submitted?.records.map((r) => r.employeeId)).toEqual(["E001"]);

    const reloaded = await getFormWithRecords(form.id);
    expect(reloaded?.records.map((r) => r.employeeId)).toEqual(["E001"]);
  });

  // draft/rejected must keep showing unfilled records so they can still be edited
  it("keeps unfilled records visible while the form is draft or rejected", async () => {
    await seedPerson("E001", "王小明");
    await seedPerson("E002", "李小華");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id },
    ]);

    const draft = await getFormWithRecords(form.id);
    expect(draft?.records.map((r) => r.employeeId).sort()).toEqual(["E001", "E002"]);

    await submitForm(form.id, "班長甲");
    const rejected = await rejectForm(form.id, "主管", "資料有誤");
    expect(rejected?.records.map((r) => r.employeeId).sort()).toEqual(["E001", "E002"]);
  });

  // AC-5: after rejection, the previously-未填 person can still be filled in and resubmitted
  it("lets a previously-未填 person be filled in after rejection and resubmitted", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await submitForm(form.id, "班長甲");
    await rejectForm(form.id, "主管", "尚未填寫");

    const filled = await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id },
    ]);
    expect(filled?.records.find((r) => r.employeeId === "E001")?.categoryId).toBe(category.id);

    const resubmitted = await submitForm(form.id, "班長甲");
    expect(resubmitted?.records.map((r) => r.employeeId)).toEqual(["E001"]);
  });
});

describe("未填不阻擋送審／核准，資料不被刪除 (T-4, spec 2026-07-31-attendance-exclude-unfilled)", () => {
  // AC-3
  it("allows submit and approve even when some people are still 未填", async () => {
    await seedPerson("E001", "王小明");
    await seedPerson("E002", "李小華");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id },
    ]);
    // E002 stays 未填

    await expect(submitForm(form.id, "班長甲")).resolves.toMatchObject({ status: "pending_review" });
    await expect(approveForm(form.id, "主管")).resolves.toMatchObject({ status: "approved" });
  });

  // AC-4
  it("does not delete or modify the unfilled AttendanceRecord row after approval", async () => {
    await seedPerson("E001", "王小明");
    await seedPerson("E002", "李小華");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id },
    ]);
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "主管");

    const records = await prisma.attendanceRecord.findMany({ where: { formId: form.id } });
    expect(records).toHaveLength(2);
    const person002 = await prisma.person.findUniqueOrThrow({ where: { employeeId: "E002" } });
    const e002 = records.find((r) => r.personId === person002.id);
    expect(e002).toBeDefined();
    expect(e002?.categoryId).toBeNull();
    expect(e002?.voided).toBe(false);
  });
});

describe("工號更正後表單詳情即時反映新值 (spec 2026-07-31-attendance-record-personid-migration AC-4)", () => {
  it("shows the corrected employeeId in getFormWithRecords without touching AttendanceRecord", async () => {
    const person = await seedPerson("E001", "王小明");
    const form = await createDailyForm("2026-01-01", "班長甲");

    await prisma.person.update({ where: { id: person.id }, data: { employeeId: "E999" } });

    const reloaded = await getFormWithRecords(form.id);
    expect(reloaded?.records.map((r) => r.employeeId)).toEqual(["E999"]);
  });
});

describe("saveFormRecords — 擴充欄位格式驗證 (spec 2026-08-01-attendance-extended-fields AC-5)", () => {
  it("rejects actualQuantity that is zero, negative, or non-integer", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");

    for (const bad of [0, -1, 1.5]) {
      await expect(
        saveFormRecords(form.id, "班長甲", [
          { employeeId: "E001", categoryId: category.id, actualQuantity: bad },
        ])
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it("accepts a positive integer actualQuantity", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");

    const updated = await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id, actualQuantity: 50 },
    ]);
    expect(updated?.records.find((r) => r.employeeId === "E001")?.actualQuantity).toBe(50);
  });

  it("rejects overtimeHours outside the 1-10 range or non-integer", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");

    for (const bad of [0, 11, 1.5]) {
      await expect(
        saveFormRecords(form.id, "班長甲", [
          { employeeId: "E001", categoryId: category.id, overtimeHours: bad },
        ])
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it("allows compliance rating / 3S performance / overtime hours / actual quantity to stay unselected without error (AC-4)", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");

    const updated = await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id },
    ]);
    const e001 = updated?.records.find((r) => r.employeeId === "E001");
    expect(e001?.complianceRatingId).toBeNull();
    expect(e001?.threeSPerformanceId).toBeNull();
    expect(e001?.overtimeHours).toBeNull();
    expect(e001?.actualQuantity).toBeNull();
  });
});

describe("saveFormRecords — 出勤類別未填時鎖定/清空其餘欄位 (spec 2026-08-01-attendance-extended-fields AC-6/AC-7/AC-8)", () => {
  it("ignores non-null extended fields and note when categoryId is null, even if the client sends them (AC-8)", async () => {
    await seedPerson("E001", "王小明");
    const complianceRating = await seedComplianceRating();
    const threeS = await seedThreeSPerformance();
    const form = await createDailyForm("2026-01-01", "班長甲");

    const updated = await saveFormRecords(form.id, "班長甲", [
      {
        employeeId: "E001",
        categoryId: null,
        note: "備註",
        overtimeHours: 3,
        complianceRatingId: complianceRating.id,
        threeSPerformanceId: threeS.id,
        actualQuantity: 10,
      },
    ]);

    const e001 = updated?.records.find((r) => r.employeeId === "E001");
    expect(e001?.categoryId).toBeNull();
    expect(e001?.note).toBeNull();
    expect(e001?.overtimeHours).toBeNull();
    expect(e001?.complianceRatingId).toBeNull();
    expect(e001?.threeSPerformanceId).toBeNull();
    expect(e001?.actualQuantity).toBeNull();
  });

  it("clears all extended fields and note when categoryId is changed back to null (AC-7)", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const complianceRating = await seedComplianceRating();
    const threeS = await seedThreeSPerformance();
    const form = await createDailyForm("2026-01-01", "班長甲");

    await saveFormRecords(form.id, "班長甲", [
      {
        employeeId: "E001",
        categoryId: category.id,
        note: "備註",
        overtimeHours: 3,
        complianceRatingId: complianceRating.id,
        threeSPerformanceId: threeS.id,
        actualQuantity: 10,
      },
    ]);

    const cleared = await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: null },
    ]);

    const e001 = cleared?.records.find((r) => r.employeeId === "E001");
    expect(e001?.categoryId).toBeNull();
    expect(e001?.note).toBeNull();
    expect(e001?.overtimeHours).toBeNull();
    expect(e001?.complianceRatingId).toBeNull();
    expect(e001?.threeSPerformanceId).toBeNull();
    expect(e001?.actualQuantity).toBeNull();
  });
});

describe("voidAndResubmitForm — 擴充欄位隨版本鏈延續 (spec 2026-08-01-attendance-extended-fields, NFR-2 回歸)", () => {
  it("carries overtimeHours/complianceRatingId/threeSPerformanceId/actualQuantity into the new draft", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const complianceRating = await seedComplianceRating();
    const threeS = await seedThreeSPerformance();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      {
        employeeId: "E001",
        categoryId: category.id,
        overtimeHours: 4,
        complianceRatingId: complianceRating.id,
        threeSPerformanceId: threeS.id,
        actualQuantity: 20,
      },
    ]);
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "主管");

    const newForm = await voidAndResubmitForm(form.id, "班長甲");
    const newE001 = newForm?.records.find((r) => r.employeeId === "E001");
    expect(newE001?.overtimeHours).toBe(4);
    expect(newE001?.complianceRatingId).toBe(complianceRating.id);
    expect(newE001?.threeSPerformanceId).toBe(threeS.id);
    expect(newE001?.actualQuantity).toBe(20);
  });

  // docs/2026-08-03-attendance-leave-lock-sop-field T-6: sopPerformanceId 是手動列出
  // 的欄位映射，容易被悄悄漏掉，跟既有四欄一起回歸。
  it("carries sopPerformanceId into the new draft", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const sop = await seedSopPerformance();
    const form = await createDailyForm("2026-01-01", "班長甲");
    await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id, sopPerformanceId: sop.id },
    ]);
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "主管");

    const newForm = await voidAndResubmitForm(form.id, "班長甲");
    const newE001 = newForm?.records.find((r) => r.employeeId === "E001");
    expect(newE001?.sopPerformanceId).toBe(sop.id);
  });
});

describe("saveFormRecords — 請假鎖定類鎖定除備註外的擴充欄位 (spec 2026-08-03-attendance-leave-lock-sop-field AC-1/AC-2/AC-3/AC-10)", () => {
  // AC-3/AC-10 的後端防線：請假鎖定類直接呼叫 API 帶入非空值，應被忽略；
  // 備註不受影響，這是跟「未填」規則的關鍵差異。
  it("ignores non-null extended fields (including sopPerformanceId) but keeps note when categoryId is a leave-locked category (AC-3)", async () => {
    await seedPerson("E001", "王小明");
    const leave = await seedLeaveCategory();
    const complianceRating = await seedComplianceRating();
    const threeS = await seedThreeSPerformance();
    const sop = await seedSopPerformance();
    const form = await createDailyForm("2026-01-01", "班長甲");

    const updated = await saveFormRecords(form.id, "班長甲", [
      {
        employeeId: "E001",
        categoryId: leave.id,
        note: "請假原因",
        overtimeHours: 3,
        complianceRatingId: complianceRating.id,
        threeSPerformanceId: threeS.id,
        sopPerformanceId: sop.id,
        actualQuantity: 10,
      },
    ]);

    const e001 = updated?.records.find((r) => r.employeeId === "E001");
    expect(e001?.categoryId).toBe(leave.id);
    expect(e001?.overtimeHours).toBeNull();
    expect(e001?.complianceRatingId).toBeNull();
    expect(e001?.threeSPerformanceId).toBeNull();
    expect(e001?.sopPerformanceId).toBeNull();
    expect(e001?.actualQuantity).toBeNull();
    // 備註跟「未填」規則不同，請假鎖定類不清空備註。
    expect(e001?.note).toBe("請假原因");
  });

  // AC-2：切入請假鎖定類時清空既有已填值，備註維持原值。
  it("clears extended fields but keeps note when switching from an unlocked category to a leave-locked one (AC-2)", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const leave = await seedLeaveCategory();
    const complianceRating = await seedComplianceRating();
    const threeS = await seedThreeSPerformance();
    const sop = await seedSopPerformance();
    const form = await createDailyForm("2026-01-01", "班長甲");

    await saveFormRecords(form.id, "班長甲", [
      {
        employeeId: "E001",
        categoryId: category.id,
        note: "原始備註",
        overtimeHours: 3,
        complianceRatingId: complianceRating.id,
        threeSPerformanceId: threeS.id,
        sopPerformanceId: sop.id,
        actualQuantity: 10,
      },
    ]);

    const switched = await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: leave.id, note: "原始備註" },
    ]);

    const e001 = switched?.records.find((r) => r.employeeId === "E001");
    expect(e001?.categoryId).toBe(leave.id);
    expect(e001?.overtimeHours).toBeNull();
    expect(e001?.complianceRatingId).toBeNull();
    expect(e001?.threeSPerformanceId).toBeNull();
    expect(e001?.sopPerformanceId).toBeNull();
    expect(e001?.actualQuantity).toBeNull();
    expect(e001?.note).toBe("原始備註");
  });

  // AC-1：檢視／編輯層面的鎖定行為由前端 disabled 呈現，這裡只驗證後端資料層
  // 確實把非備註欄位鎖住（跟 AC-3 同一條規則，另立一個案例確認語意清楚）。
  it("keeps categoryId as the leave-locked category when only note is saved", async () => {
    await seedPerson("E001", "王小明");
    const leave = await seedLeaveCategory();
    const form = await createDailyForm("2026-01-01", "班長甲");

    const updated = await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: leave.id, note: "備註可填" },
    ]);
    const e001 = updated?.records.find((r) => r.employeeId === "E001");
    expect(e001?.categoryId).toBe(leave.id);
    expect(e001?.note).toBe("備註可填");
  });
});

describe("saveFormRecords — 切換出勤類別由鎖定解除時，3S表現／SOP表現自動預設「正常」 (spec 2026-08-03-attendance-leave-lock-sop-field AC-7)", () => {
  it("defaults threeSPerformanceId/sopPerformanceId to the locked 「正常」 option when switching from null to an unlocked category without specifying them", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const normalThreeS = await seedLockedThreeSPerformance();
    const normalSop = await seedLockedSopPerformance();
    const form = await createDailyForm("2026-01-01", "班長甲");
    // E001 starts 未填 (categoryId null) by createDailyForm's default.

    const updated = await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id },
    ]);

    const e001 = updated?.records.find((r) => r.employeeId === "E001");
    expect(e001?.threeSPerformanceId).toBe(normalThreeS.id);
    expect(e001?.sopPerformanceId).toBe(normalSop.id);
  });

  it("defaults threeSPerformanceId/sopPerformanceId when switching from a leave-locked category to an unlocked one", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    const leave = await seedLeaveCategory();
    const normalThreeS = await seedLockedThreeSPerformance();
    const normalSop = await seedLockedSopPerformance();
    const form = await createDailyForm("2026-01-01", "班長甲");

    await saveFormRecords(form.id, "班長甲", [{ employeeId: "E001", categoryId: leave.id }]);
    const updated = await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id },
    ]);

    const e001 = updated?.records.find((r) => r.employeeId === "E001");
    expect(e001?.threeSPerformanceId).toBe(normalThreeS.id);
    expect(e001?.sopPerformanceId).toBe(normalSop.id);
  });

  it("does not override an explicitly specified threeSPerformanceId/sopPerformanceId when unlocking", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    await seedLockedThreeSPerformance();
    await seedLockedSopPerformance();
    const otherThreeS = await seedThreeSPerformance("ABNORMAL", "異常");
    const otherSop = await seedSopPerformance("ABNORMAL", "異常");
    const form = await createDailyForm("2026-01-01", "班長甲");

    const updated = await saveFormRecords(form.id, "班長甲", [
      {
        employeeId: "E001",
        categoryId: category.id,
        threeSPerformanceId: otherThreeS.id,
        sopPerformanceId: otherSop.id,
      },
    ]);

    const e001 = updated?.records.find((r) => r.employeeId === "E001");
    expect(e001?.threeSPerformanceId).toBe(otherThreeS.id);
    expect(e001?.sopPerformanceId).toBe(otherSop.id);
  });

  // AC-9：配合度欄位不受本次規則影響，不套用自動預設，維持允許 null。
  it("does not default complianceRatingId — it stays whatever the caller sent, including null (AC-9)", async () => {
    await seedPerson("E001", "王小明");
    const category = await seedCategory();
    await seedLockedThreeSPerformance();
    await seedLockedSopPerformance();
    const form = await createDailyForm("2026-01-01", "班長甲");

    const updated = await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id },
    ]);
    const e001 = updated?.records.find((r) => r.employeeId === "E001");
    expect(e001?.complianceRatingId).toBeNull();
  });

  // AC-11：既有舊資料（3S表現為 null）不因本次規則被回填——只有「實際切換出勤
  // 類別」的操作才會觸發自動預設，單純改備註等其他欄位不會。
  it("does not backfill an existing null threeSPerformanceId when categoryId is not part of the change (AC-11/FR-12)", async () => {
    const person = await seedPerson("E001", "王小明");
    const category = await seedCategory();
    await seedLockedThreeSPerformance();
    await seedLockedSopPerformance();
    const form = await createDailyForm("2026-01-01", "班長甲");

    // Simulate a legacy row: unlocked category already set, 3S表現/SOP表現 still
    // null (as if written before this feature existed), bypassing saveFormRecords.
    await prisma.attendanceRecord.updateMany({
      where: { formId: form.id, personId: person.id },
      data: { categoryId: category.id },
    });

    const untouched = await getFormWithRecords(form.id);
    expect(
      untouched?.records.find((r) => r.employeeId === "E001")?.threeSPerformanceId
    ).toBeNull();

    // Saving an unrelated field (note) without touching categoryId must not
    // trigger the auto-default — only an actual lock -> unlock transition does.
    const saved = await saveFormRecords(form.id, "班長甲", [
      { employeeId: "E001", categoryId: category.id, note: "只改備註" },
    ]);
    const e001 = saved?.records.find((r) => r.employeeId === "E001");
    expect(e001?.note).toBe("只改備註");
    expect(e001?.threeSPerformanceId).toBeNull();
  });
});
