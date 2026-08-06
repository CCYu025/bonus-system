// Route-level test（見 docs/testing.md「When a route-level test is worth it」）：
// 這裡驗證 GET 未登入回 401（AC-14），且 foreman／developer 兩種角色皆能成功
// 查詢、不會被擋 403（AC-13）——比照 /api/attendance-query/by-month 的
// requireAuth-only 慣例，刻意不呼叫 requireRole。
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "../../../../../test/reset-db";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/client";

let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "sid" && cookieValue ? { value: cookieValue } : undefined),
  }),
}));

import { GET } from "./route";

function makeRequest(month: string) {
  return { nextUrl: new URL(`http://localhost/api/score-query/by-month?month=${month}`) } as never;
}

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

describe("/api/score-query/by-month GET auth", () => {
  it("returns 401 with no session (AC-14)", async () => {
    const res = await GET(makeRequest("2026-01"));
    expect(res.status).toBe(401);
  });

  it("returns 200 for a foreman session (AC-13)", async () => {
    cookieValue = await createSessionFor("foreman");
    const res = await GET(makeRequest("2026-01"));
    expect(res.status).toBe(200);
  });

  it("returns 200 for a developer session (AC-13)", async () => {
    cookieValue = await createSessionFor("developer");
    const res = await GET(makeRequest("2026-01"));
    expect(res.status).toBe(200);
  });
});
