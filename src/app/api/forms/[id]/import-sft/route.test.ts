// Route-level test（見 docs/testing.md）：驗證權限（AC-18）、表單狀態限制（AC-17）、
// NFR-3 payload 驗證、以及 NFR-1/AC-15（不寫入資料庫）在路由這一層也成立。分類/加總
// 邏輯本身由 src/lib/attendance-import.test.ts 覆蓋。
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { resetDb } from "../../../../../../test/reset-db";
import { prisma } from "@/lib/prisma";
import { createDailyForm, saveFormRecords } from "@/lib/forms";
import type { UserRole } from "@/generated/prisma/client";

let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "sid" && cookieValue ? { value: cookieValue } : undefined),
  }),
}));

import { POST } from "./route";

afterEach(async () => {
  cookieValue = undefined;
  await resetDb();
});

async function createSessionFor(role: UserRole) {
  const user = await prisma.user.create({
    data: {
      username: `u-${role}-${Math.random().toString(36).slice(2)}`,
      passwordHash: "x",
      role,
      displayName: role,
    },
  });
  const session = await prisma.session.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  return session.id;
}

function buildSftFile(rows: { date: string; employeeId: string; name: string; quantity: number }[]) {
  const aoa = [
    ["", "", "", "", "毅豐橡膠"],
    ["", "", "", "", "生產日報表(人員)"],
    ["生產日期", "項次", "員工代號", "姓名", "數量"],
    ...rows.map((r, i) => [r.date, i + 1, r.employeeId, r.name, r.quantity]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "SFTR19_Excel");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xls" }) as Buffer;
  return new Blob([new Uint8Array(buffer)]);
}

function buildRequest(formId: string, file: Blob, effectiveCategories?: Record<string, string | null>) {
  const formData = new FormData();
  formData.append("file", file, "sft.xls");
  if (effectiveCategories) {
    formData.append("effectiveCategories", JSON.stringify(effectiveCategories));
  }
  return new NextRequest(`http://localhost/api/forms/${formId}/import-sft`, {
    method: "POST",
    body: formData,
  });
}

async function setupForm() {
  const category = await prisma.attendanceCategory.create({ data: { code: "NORMAL", name: "正常出勤" } });
  const person = await prisma.person.create({ data: { employeeId: "000051", name: "陳玉葉" } });
  const form = await createDailyForm("2026-08-10", "班長甲");
  await saveFormRecords(form.id, "班長甲", [{ employeeId: person.employeeId, categoryId: category.id }]);
  return { category, person, form };
}

describe("POST /api/forms/[id]/import-sft auth (AC-18)", () => {
  it("returns 401 with no session", async () => {
    const { form } = await setupForm();
    const res = await POST(buildRequest(form.id, buildSftFile([])), {
      params: Promise.resolve({ id: form.id }),
    });
    expect(res.status).toBe(401);
  });

  it("succeeds for a foreman session, same as PATCH /records", async () => {
    const { form } = await setupForm();
    cookieValue = await createSessionFor("foreman");
    const res = await POST(buildRequest(form.id, buildSftFile([])), {
      params: Promise.resolve({ id: form.id }),
    });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/forms/[id]/import-sft 表單狀態限制 (AC-17)", () => {
  it("rejects import when the form is pending_review", async () => {
    const { form } = await setupForm();
    cookieValue = await createSessionFor("foreman");
    await prisma.attendanceForm.update({ where: { id: form.id }, data: { status: "pending_review" } });

    const res = await POST(buildRequest(form.id, buildSftFile([])), {
      params: Promise.resolve({ id: form.id }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects import when the form is approved", async () => {
    const { form } = await setupForm();
    cookieValue = await createSessionFor("foreman");
    await prisma.attendanceForm.update({ where: { id: form.id }, data: { status: "approved" } });

    const res = await POST(buildRequest(form.id, buildSftFile([])), {
      params: Promise.resolve({ id: form.id }),
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/forms/[id]/import-sft NFR-3", () => {
  it("rejects effectiveCategories containing an employeeId outside this form's roster", async () => {
    const { form } = await setupForm();
    cookieValue = await createSessionFor("foreman");

    const res = await POST(
      buildRequest(form.id, buildSftFile([]), { "999999": null }),
      { params: Promise.resolve({ id: form.id }) }
    );
    expect(res.status).toBe(400);
  });

  it("rejects effectiveCategories containing a categoryId that doesn't exist", async () => {
    const { form, person } = await setupForm();
    cookieValue = await createSessionFor("foreman");

    const res = await POST(
      buildRequest(form.id, buildSftFile([]), { [person.employeeId]: "not-a-real-category-id" }),
      { params: Promise.resolve({ id: form.id }) }
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/forms/[id]/import-sft NFR-1/AC-15（不寫入資料庫）", () => {
  it("does not modify the form or its records even for a matched row", async () => {
    const { form, person } = await setupForm();
    cookieValue = await createSessionFor("foreman");

    const before = await prisma.attendanceRecord.findMany({ where: { formId: form.id } });

    const file = buildSftFile([{ date: "2026-08-10", employeeId: person.employeeId, name: person.name, quantity: 38 }]);
    const res = await POST(buildRequest(form.id, file), { params: Promise.resolve({ id: form.id }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.matched).toEqual([
      { personId: person.id, employeeId: person.employeeId, name: person.name, quantity: 38 },
    ]);

    const after = await prisma.attendanceRecord.findMany({ where: { formId: form.id } });
    expect(after).toEqual(before);
  });
});

describe("POST /api/forms/[id]/import-sft AC-6（effectiveCategories 覆蓋 DB 已存值）", () => {
  it("uses the effectiveCategories override even when it disagrees with the record's saved categoryId", async () => {
    const { form, person } = await setupForm(); // DB 上這個人目前是 NORMAL（target 類別）
    const leaveCategory = await prisma.attendanceCategory.create({
      data: { code: "PERSONAL_LEAVE", name: "事假" },
    });
    cookieValue = await createSessionFor("foreman");

    // 請求把有效類別覆蓋成非 target 類別（尚未儲存進 DB），驗證分類結果真的採用
    // 覆蓋值而非表單已存的 NORMAL——若沒套用覆蓋，這筆會被誤判為 matched。
    const file = buildSftFile([{ date: "2026-08-10", employeeId: person.employeeId, name: person.name, quantity: 12 }]);
    const res = await POST(buildRequest(form.id, file, { [person.employeeId]: leaveCategory.id }), {
      params: Promise.resolve({ id: form.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matched).toEqual([]);
    expect(body.skippedWrongCategory).toEqual([
      { personId: person.id, employeeId: person.employeeId, name: person.name },
    ]);

    // DB 上仍是 NORMAL，未被這次請求動到（NFR-1/AC-15）。
    const record = await prisma.attendanceRecord.findFirst({ where: { formId: form.id } });
    expect(record?.categoryId).toBe((await prisma.attendanceCategory.findUnique({ where: { code: "NORMAL" } }))?.id);
  });
});
