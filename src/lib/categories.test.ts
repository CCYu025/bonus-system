import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import { listCategories, setCategoryActive } from "./categories";
import { prisma } from "./prisma";

afterEach(async () => {
  await resetDb();
});

function seedCategory(code: string, name: string, sortOrder = 0) {
  return prisma.attendanceCategory.create({ data: { code, name, sortOrder } });
}

describe("categories", () => {
  it("lists categories", async () => {
    await seedCategory("OT", "加班");

    const categories = await listCategories();
    expect(categories.map((c) => c.code)).toContain("OT");
  });

  it("listCategories(true) only returns active categories", async () => {
    const category = await seedCategory("OT", "加班");
    await setCategoryActive(category.id, false);
    await seedCategory("SICK", "病假");

    const active = await listCategories(true);
    expect(active.map((c) => c.code)).toEqual(["SICK"]);
  });

  it("rejects deactivating a category that does not exist", async () => {
    await expect(setCategoryActive("missing-id", false)).rejects.toMatchObject({ status: 404 });
  });
});
