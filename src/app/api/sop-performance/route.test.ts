// Route-level test (see docs/testing.md "When a route-level test is worth it"):
// only checks that requireAuth/requireRole are actually wired up on this new
// route, not the lib logic (already covered by sop-performance.test.ts).
// See src/app/api/compliance-ratings/route.test.ts for why next/headers is mocked.
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

describe("/api/sop-performance POST auth", () => {
  it("returns 401 with no session", async () => {
    const req = new NextRequest("http://localhost/api/sop-performance", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a foreman session", async () => {
    cookieValue = await createSessionFor("foreman");
    const req = new NextRequest("http://localhost/api/sop-performance", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

describe("/api/sop-performance/[id] PATCH auth", () => {
  it("returns 401 with no session", async () => {
    const req = new NextRequest("http://localhost/api/sop-performance/abc", {
      method: "PATCH",
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a foreman session", async () => {
    cookieValue = await createSessionFor("foreman");
    const req = new NextRequest("http://localhost/api/sop-performance/abc", {
      method: "PATCH",
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(403);
  });
});
