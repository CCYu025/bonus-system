import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import {
  createComplianceRating,
  listComplianceRatings,
  updateComplianceRating,
} from "./compliance-ratings";
import { prisma } from "./prisma";

afterEach(async () => {
  await resetDb();
});

describe("compliance-ratings", () => {
  it("creates and lists compliance ratings", async () => {
    const created = await createComplianceRating({ code: "CROSS", name: "跨崗位", sortOrder: 1 });

    const all = await listComplianceRatings();
    expect(all.map((c) => c.code)).toContain("CROSS");
    expect(created.name).toBe("跨崗位");
  });

  it("does not include a score/weight field on created records", async () => {
    const created = await createComplianceRating({ code: "CROSS", name: "跨崗位" });
    expect(Object.keys(created)).not.toContain("score");
    expect(Object.keys(created)).not.toContain("weight");
  });

  it("rejects creating with a duplicate code", async () => {
    await createComplianceRating({ code: "CROSS", name: "跨崗位" });
    await expect(
      createComplianceRating({ code: "CROSS", name: "重複" })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects creating without code or name", async () => {
    await expect(createComplianceRating({ code: "", name: "跨崗位" })).rejects.toMatchObject({
      status: 400,
    });
    await expect(createComplianceRating({ code: "CROSS", name: "" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("listComplianceRatings(true) only returns active ratings", async () => {
    const rating = await createComplianceRating({ code: "CROSS", name: "跨崗位" });
    await updateComplianceRating(rating.id, { isActive: false });
    await createComplianceRating({ code: "TEAM", name: "團隊合作" });

    const active = await listComplianceRatings(true);
    expect(active.map((c) => c.code)).toEqual(["TEAM"]);
  });

  it("updates code/name/sortOrder/isActive", async () => {
    const rating = await createComplianceRating({ code: "CROSS", name: "跨崗位" });

    const updated = await updateComplianceRating(rating.id, {
      code: "CROSS2",
      name: "跨崗位支援",
      sortOrder: 5,
      isActive: false,
    });

    expect(updated.code).toBe("CROSS2");
    expect(updated.name).toBe("跨崗位支援");
    expect(updated.sortOrder).toBe(5);
    expect(updated.isActive).toBe(false);
  });

  it("rejects updating a rating that does not exist", async () => {
    await expect(
      updateComplianceRating("missing-id", { isActive: false })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects updating to a duplicate code", async () => {
    await createComplianceRating({ code: "CROSS", name: "跨崗位" });
    const other = await createComplianceRating({ code: "TEAM", name: "團隊合作" });

    await expect(
      updateComplianceRating(other.id, { code: "CROSS" })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("persists via prisma directly as compliance_rating table", async () => {
    await createComplianceRating({ code: "CROSS", name: "跨崗位" });
    const rows = await prisma.complianceRating.findMany();
    expect(rows).toHaveLength(1);
  });
});
