// Route-level test（見 docs/testing.md）：驗證 POST 的權限放寬（T-5 / AC-13）
// 確實落地——foreman 現在應該能成功呼叫，不再是既有的 developer-only。
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetDb } from "../../../../test/reset-db";
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

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/persons", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/persons POST auth", () => {
  it("returns 401 with no session", async () => {
    const res = await POST(postRequest({ employeeId: "E001", name: "王小明" }));
    expect(res.status).toBe(401);
  });

  // AC-13: 既有功能權限放寬，班長現在也能新增人員，不再回 403。
  it("succeeds for a foreman session", async () => {
    cookieValue = await createSessionFor("foreman");
    const res = await POST(postRequest({ employeeId: "E001", name: "王小明" }));
    expect(res.status).toBe(200);
  });

  it("still succeeds for a developer session (no regression)", async () => {
    cookieValue = await createSessionFor("developer");
    const res = await POST(postRequest({ employeeId: "E001", name: "王小明" }));
    expect(res.status).toBe(200);
  });
});
