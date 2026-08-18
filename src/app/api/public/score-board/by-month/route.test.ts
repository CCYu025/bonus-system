// Route-level test（見 docs/testing.md「When a route-level test is worth it」）：
// 驗證 spec.md NFR-1（免驗證，AC-6）、NFR-3/AC-7（不建立任何 session）、
// NFR-2/AC-5（跟既有 /api/score-query/by-month 回傳內容完全一致）、AC-3（無資料
// 回傳空陣列，提示文字由前端負責呈現）。
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "../../../../../../test/reset-db";
import { prisma } from "@/lib/prisma";
import { createDailyForm, saveFormRecords, submitForm, approveForm } from "@/lib/forms";

let mockedSid: string | undefined;

// authedGet（既有 /api/score-query/by-month）需要一個已登入的 session cookie
// 才會回 200，用最小 mock 手法複寫 next/headers 的 cookies()；publicGet
// 完全不呼叫 cookies()，不受此 mock 影響。
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "sid" && mockedSid ? { value: mockedSid } : undefined),
  }),
}));

import { GET as publicGet } from "./route";
import { GET as authedGet } from "../../../score-query/by-month/route";

function makeRequest(month: string) {
  return { nextUrl: new URL(`http://localhost/api/public/score-board/by-month?month=${month}`) } as never;
}

async function createSessionFor(role: "developer" | "foreman") {
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

afterEach(async () => {
  mockedSid = undefined;
  await resetDb();
});

describe("/api/public/score-board/by-month GET (AC-6/AC-3)", () => {
  it("returns 200 with no session at all (AC-6)", async () => {
    const res = await publicGet(makeRequest("2026-08"));
    expect(res.status).toBe(200);
  });

  it("does not set any cookie, and creates no session row (AC-7)", async () => {
    const before = await prisma.session.count();
    const res = await publicGet(makeRequest("2026-08"));
    expect(res.headers.get("set-cookie")).toBeNull();
    const after = await prisma.session.count();
    expect(after).toBe(before);
  });

  it("returns [] when the month has no qualifying data (AC-3 data precondition)", async () => {
    const res = await publicGet(makeRequest("2020-01"));
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

describe("/api/public/score-board/by-month matches the authenticated /api/score-query/by-month (AC-5/NFR-2)", () => {
  it("returns identical scores/records for the same month", async () => {
    const category = await prisma.attendanceCategory.create({ data: { code: "NORMAL", name: "正常出勤" } });
    await prisma.categoryScoreRule.create({
      data: { categoryId: category.id, points: 100, updatedBy: "seed" },
    });
    const person = await prisma.person.create({ data: { employeeId: "000051", name: "陳玉葉" } });
    const form = await createDailyForm("2026-08-10", "班長甲");
    await saveFormRecords(form.id, "班長甲", [{ employeeId: person.employeeId, categoryId: category.id }]);
    await submitForm(form.id, "班長甲");
    await approveForm(form.id, "開發者甲");

    mockedSid = await createSessionFor("developer");
    const authedRes = await authedGet(makeRequest("2026-08"));
    const authedBody = await authedRes.json();

    const publicRes = await publicGet(makeRequest("2026-08"));
    const publicBody = await publicRes.json();

    expect(publicBody).toEqual(authedBody);
  });
});
