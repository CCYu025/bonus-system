// Route-level test，同 category-score-rules/route.test.ts 的理由：GET 也擋 foreman。
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

import { GET } from "./route";
import { PATCH } from "./[id]/route";

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

describe("/api/overtime-score-rules GET auth", () => {
  it("returns 401 with no session", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a foreman session (AC-11 — 唯讀也擋)", async () => {
    cookieValue = await createSessionFor("foreman");
    const res = await GET();
    expect(res.status).toBe(403);
  });
});

describe("/api/overtime-score-rules/[id] PATCH auth", () => {
  it("returns 401 with no session", async () => {
    const req = new NextRequest("http://localhost/api/overtime-score-rules/abc", {
      method: "PATCH",
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a foreman session", async () => {
    cookieValue = await createSessionFor("foreman");
    const req = new NextRequest("http://localhost/api/overtime-score-rules/abc", {
      method: "PATCH",
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(403);
  });
});
