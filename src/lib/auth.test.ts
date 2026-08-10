// See src/app/api/compliance-ratings/route.test.ts for why next/headers'
// cookies() needs mocking here: it throws outside an actual Next.js request
// scope, so we mock just the cookie read and let requireAuth/requireRole run
// for real against a real Session row in the test DB.
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "../../test/reset-db";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/client";

let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "sid" && cookieValue ? { value: cookieValue } : undefined),
  }),
}));

import { requireRole } from "./auth";

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

// T-4: requireRole's signature grew to accept UserRole | UserRole[]. These
// cases pin both the pre-existing single-role behavior (no regression) and
// the new array behavior the import feature's routes rely on.
describe("requireRole", () => {
  it("accepts a single role string when it matches (existing behavior)", async () => {
    cookieValue = await createSessionFor("developer");
    await expect(requireRole("developer")).resolves.toBeDefined();
  });

  it("rejects a single role string when it does not match (existing behavior)", async () => {
    cookieValue = await createSessionFor("foreman");
    await expect(requireRole("developer")).rejects.toMatchObject({ status: 403 });
  });

  it("accepts an array of roles when the session role is included", async () => {
    cookieValue = await createSessionFor("foreman");
    await expect(requireRole(["foreman", "developer"])).resolves.toBeDefined();

    cookieValue = await createSessionFor("developer");
    await expect(requireRole(["foreman", "developer"])).resolves.toBeDefined();
  });

  it("rejects an array of roles when the session role is not included", async () => {
    cookieValue = await createSessionFor("foreman");
    await expect(requireRole(["developer"])).rejects.toMatchObject({ status: 403 });
  });
});
