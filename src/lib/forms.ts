import { prisma } from "@/lib/prisma";
import type { FormStatus } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { AppError, isPrismaUniqueConstraintError } from "@/lib/errors";
import { isFilledRecord } from "@/lib/attendance-records";

// Statuses in which a form's records may still be edited (FR-7/AC-9, FR-5 reject flow).
const EDITABLE_STATUSES = ["draft", "rejected"] as const;

function assertEditable(status: string) {
  if (!EDITABLE_STATUSES.includes(status as (typeof EDITABLE_STATUSES)[number])) {
    throw new AppError(
      409,
      "已核准表單不可直接修改，如需更正請使用「作廢重審」流程"
    );
  }
}

// 待審核（pending_review）狀態的表單，回傳給待審核詳情畫面的人員清單排除未填人員
// （AC-1）；draft／rejected 等可編輯狀態維持回傳完整清單，確保班長能看到並補上
// 未填人員（AC-5／AC-6 的補救流程依賴這裡不能把未填的人員濾掉）。
export async function getFormWithRecords(formId: string) {
  const form = await prisma.attendanceForm.findUnique({
    where: { id: formId },
    include: {
      records: {
        include: { person: true, category: true },
        orderBy: { person: { employeeId: "asc" } },
      },
      auditLogs: { orderBy: { createdAt: "asc" } },
      previousForm: true,
      nextForm: true,
    },
  });
  if (!form) return form;

  // employeeId is no longer a column on AttendanceRecord (see
  // docs/2026-07-31-attendance-record-personid-migration) — flatten it back
  // from the person relation so the API response shape is unchanged.
  const records = form.records.map((r) => ({ ...r, employeeId: r.person.employeeId }));
  if (form.status !== "pending_review") return { ...form, records };
  return { ...form, records: records.filter(isFilledRecord) };
}

export function findActiveFormByDate(date: string) {
  return prisma.attendanceForm.findFirst({
    where: { date, status: { not: "voided" } },
  });
}

export function listForms(params: { status?: FormStatus } = {}) {
  return prisma.attendanceForm.findMany({
    where: params.status ? { status: params.status } : undefined,
    orderBy: { date: "desc" },
    include: {
      _count: { select: { records: true } },
    },
  });
}

// AC-4 / T-6: create the day's form with every active person defaulted to "未填",
// and record the operator's name as the identity for this fill session.
export async function createDailyForm(date: string, operatorName: string) {
  if (!date || !operatorName?.trim()) {
    throw new AppError(400, "日期與操作者姓名為必填");
  }

  const existing = await findActiveFormByDate(date);
  if (existing) {
    return existing;
  }

  const activePersons = await prisma.person.findMany({
    where: { status: "active" },
  });

  try {
    return await prisma.$transaction(async (tx) => {
      const form = await tx.attendanceForm.create({
        data: {
          date,
          status: "draft",
          activeDateKey: date,
          records: {
            create: activePersons.map((p) => ({
              personId: p.id,
              date,
              categoryId: null,
              activeKey: `${p.id}:${date}`,
            })),
          },
        },
      });
      await writeAuditLog(tx, {
        formId: form.id,
        action: "created",
        operatorName: operatorName.trim(),
      });
      return form;
    });
  } catch (err) {
    if (isPrismaUniqueConstraintError(err)) {
      throw new AppError(409, `${date} 的出勤表單已存在`);
    }
    throw err;
  }
}

export type RecordChange = {
  employeeId: string;
  categoryId: string | null;
  note?: string | null;
};

// T-7: upsert only the rows the caller actually changed, so concurrent
// operators editing different employees never clobber each other (AC-11).
export async function saveFormRecords(
  formId: string,
  operatorName: string,
  changes: RecordChange[]
) {
  if (!operatorName?.trim()) {
    throw new AppError(400, "操作者姓名為必填");
  }
  const form = await prisma.attendanceForm.findUnique({ where: { id: formId } });
  if (!form) throw new AppError(404, "找不到表單");
  assertEditable(form.status);

  if (changes.length === 0) {
    throw new AppError(400, "沒有變更內容");
  }

  await prisma.$transaction(async (tx) => {
    for (const change of changes) {
      const person = await tx.person.findUnique({ where: { employeeId: change.employeeId } });
      const record = person
        ? await tx.attendanceRecord.findUnique({
            where: { personId_formId: { personId: person.id, formId } },
          })
        : null;
      if (!record) {
        throw new AppError(404, `表單中找不到工號 ${change.employeeId}`);
      }
      await tx.attendanceRecord.update({
        where: { id: record.id },
        data: {
          categoryId: change.categoryId,
          note: change.note ?? null,
        },
      });
    }
    await writeAuditLog(tx, {
      formId,
      action: "saved_draft",
      operatorName: operatorName.trim(),
      note: `更新 ${changes.length} 筆人員資料`,
    });
  });

  return getFormWithRecords(formId);
}

// AC-5 / T-8: any single operator may submit independently; "未填" rows go along as-is.
export async function submitForm(formId: string, operatorName: string) {
  if (!operatorName?.trim()) {
    throw new AppError(400, "操作者姓名為必填");
  }
  const form = await prisma.attendanceForm.findUnique({ where: { id: formId } });
  if (!form) throw new AppError(404, "找不到表單");
  assertEditable(form.status);

  await prisma.$transaction(async (tx) => {
    await tx.attendanceForm.update({
      where: { id: formId },
      data: { status: "pending_review", rejectReason: null },
    });
    await writeAuditLog(tx, {
      formId,
      action: "submitted",
      operatorName: operatorName.trim(),
    });
  });

  return getFormWithRecords(formId);
}

// AC-6 / T-10
export async function approveForm(formId: string, operatorName: string) {
  if (!operatorName?.trim()) {
    throw new AppError(400, "操作者姓名為必填");
  }
  const form = await prisma.attendanceForm.findUnique({ where: { id: formId } });
  if (!form) throw new AppError(404, "找不到表單");
  if (form.status !== "pending_review") {
    throw new AppError(409, "僅能核准待審表單");
  }

  await prisma.$transaction(async (tx) => {
    await tx.attendanceForm.update({
      where: { id: formId },
      data: { status: "approved" },
    });
    await writeAuditLog(tx, {
      formId,
      action: "approved",
      operatorName: operatorName.trim(),
    });
  });

  return getFormWithRecords(formId);
}

// AC-7 / T-11
export async function rejectForm(
  formId: string,
  operatorName: string,
  reason?: string
) {
  if (!operatorName?.trim()) {
    throw new AppError(400, "操作者姓名為必填");
  }
  const form = await prisma.attendanceForm.findUnique({ where: { id: formId } });
  if (!form) throw new AppError(404, "找不到表單");
  if (form.status !== "pending_review") {
    throw new AppError(409, "僅能退回待審表單");
  }

  await prisma.$transaction(async (tx) => {
    await tx.attendanceForm.update({
      where: { id: formId },
      data: { status: "rejected", rejectReason: reason?.trim() || null },
    });
    await writeAuditLog(tx, {
      formId,
      action: "rejected",
      operatorName: operatorName.trim(),
      note: reason?.trim() || null,
    });
  });

  return getFormWithRecords(formId);
}

// AC-10 / T-14: approved form -> voided (kept, unlocked from the date), new draft
// version created with the same records, full trail linked both ways.
export async function voidAndResubmitForm(formId: string, operatorName: string) {
  if (!operatorName?.trim()) {
    throw new AppError(400, "操作者姓名為必填");
  }
  const form = await prisma.attendanceForm.findUnique({
    where: { id: formId },
    include: { records: true },
  });
  if (!form) throw new AppError(404, "找不到表單");
  if (form.status !== "approved") {
    throw new AppError(409, "僅能對已核准表單觸發作廢重審");
  }

  const newForm = await prisma.$transaction(async (tx) => {
    await tx.attendanceForm.update({
      where: { id: form.id },
      data: { status: "voided", activeDateKey: null },
    });
    await tx.attendanceRecord.updateMany({
      where: { formId: form.id },
      data: { voided: true, activeKey: null },
    });

    const created = await tx.attendanceForm.create({
      data: {
        date: form.date,
        status: "draft",
        version: form.version + 1,
        previousFormId: form.id,
        activeDateKey: form.date,
        records: {
          create: form.records.map((r) => ({
            personId: r.personId,
            date: form.date,
            categoryId: r.categoryId,
            note: r.note,
            activeKey: `${r.personId}:${form.date}`,
          })),
        },
      },
    });

    await writeAuditLog(tx, {
      formId: form.id,
      action: "voided_resubmitted",
      operatorName: operatorName.trim(),
      note: `作廢，由新版本 ${created.id} 取代`,
    });
    await writeAuditLog(tx, {
      formId: created.id,
      action: "created",
      operatorName: operatorName.trim(),
      note: `重審自表單 ${form.id}`,
    });

    return created;
  });

  return getFormWithRecords(newForm.id);
}
