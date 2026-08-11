// Route-level test（見 docs/testing.md）：驗證 DELETE（設為離職）的權限放寬
// （T-5 / AC-14）確實落地——foreman 現在應該能成功呼叫，不再是 developer-only。
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "../../../../../test/reset-db";
import { prisma } from "@/lib/prisma";
import { createPerson } from "@/lib/persons";
import type { UserRole } from "@/generated/prisma/client";

let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "sid" && cookieValue ? { value: cookieValue } : undefined),
  }),
}));

import { DELETE } from "./route";

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

describe("/api/persons/[employeeId] DELETE auth", () => {
  it("returns 401 with no session", async () => {
    const res = await DELETE(new Request("http://localhost/api/persons/E001"), {
      params: Promise.resolve({ employeeId: "E001" }),
    });
    expect(res.status).toBe(401);
  });

  // AC-14: 既有功能權限放寬，班長現在也能將人員設為離職，不再回 403。
  it("succeeds for a foreman session", async () => {
    await createPerson("E001", "王小明");
    cookieValue = await createSessionFor("foreman");
    const res = await DELETE(new Request("http://localhost/api/persons/E001"), {
      params: Promise.resolve({ employeeId: "E001" }),
    });
    expect(res.status).toBe(200);
  });
});
