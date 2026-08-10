// Route-level test（見 docs/testing.md）：驗證權限（foreman + developer 皆可，
// FR-8）與「只套用傳入的 selections」（AC-9）在路由這一層也成立，套用邏輯本身
// 由 src/lib/persons-import.test.ts 覆蓋。
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
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

function applyRequest(selections: unknown[]) {
  return new NextRequest("http://localhost/api/persons/import/apply", {
    method: "POST",
    body: JSON.stringify({ selections }),
  });
}

describe("/api/persons/import/apply POST auth", () => {
  it("returns 401 with no session", async () => {
    const res = await POST(applyRequest([]));
    expect(res.status).toBe(401);
  });

  it("succeeds for a foreman session (FR-8)", async () => {
    cookieValue = await createSessionFor("foreman");
    const res = await POST(applyRequest([]));
    expect(res.status).toBe(200);
  });
});

describe("/api/persons/import/apply AC-9", () => {
  it("only applies the selections included in the request body", async () => {
    cookieValue = await createSessionFor("developer");

    const res = await POST(
      applyRequest([{ kind: "create", importEmployeeId: "E300", importName: "張小強" }])
    );
    expect(res.status).toBe(200);

    expect(await prisma.person.count()).toBe(1);
    const created = await prisma.person.findUnique({ where: { employeeId: "E300" } });
    expect(created?.name).toBe("張小強");
  });
});
