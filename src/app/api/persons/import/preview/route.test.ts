// Route-level test（見 docs/testing.md）：驗證權限（foreman + developer 皆可，
// FR-8）與 NFR-1（預覽不得寫入資料庫）在路由這一層也成立，解析/分類邏輯本身
// 由 src/lib/persons-import.test.ts 覆蓋。
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { resetDb } from "../../../../../../test/reset-db";
import { prisma } from "@/lib/prisma";
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

function buildFileRequest() {
  const aoa = [
    ["", "", "", "", ""],
    ["", "", "", "", ""],
    ["生產日期", "項次", "員工代號", "姓名", "報工單號"],
    ["2026-08-06", 1, "E300", "張小強", "D000-0001"],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "SFTR19_Excel");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xls" }) as Buffer;

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(buffer)]), "sft.xls");
  return new NextRequest("http://localhost/api/persons/import/preview", {
    method: "POST",
    body: formData,
  });
}

describe("/api/persons/import/preview POST auth", () => {
  it("returns 401 with no session", async () => {
    const res = await POST(buildFileRequest());
    expect(res.status).toBe(401);
  });

  it("succeeds for a foreman session (FR-8)", async () => {
    cookieValue = await createSessionFor("foreman");
    const res = await POST(buildFileRequest());
    expect(res.status).toBe(200);
  });
});

describe("/api/persons/import/preview NFR-1", () => {
  it("does not write to the database even when the upload contains a create-candidate", async () => {
    cookieValue = await createSessionFor("developer");
    const before = await prisma.person.count();

    const res = await POST(buildFileRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([
      { kind: "create", importEmployeeId: "E300", importName: "張小強" },
    ]);

    expect(await prisma.person.count()).toBe(before);
  });
});
