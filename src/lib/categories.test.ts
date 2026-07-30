import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import { createCategory, listCategories, setCategoryActive } from "./categories";

afterEach(async () => {
  await resetDb();
});

describe("categories", () => {
  it("creates a category and lists it back", async () => {
    await createCategory({ code: "OT", name: "加班" });

    const categories = await listCategories();
    expect(categories.map((c) => c.code)).toContain("OT");
  });

  it("rejects a duplicate code", async () => {
    await createCategory({ code: "OT", name: "加班" });

    await expect(createCategory({ code: "OT", name: "加班2" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("rejects a missing code or name", async () => {
    await expect(createCategory({ code: "", name: "加班" })).rejects.toMatchObject({
      status: 400,
    });
    await expect(createCategory({ code: "OT", name: "  " })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("listCategories(true) only returns active categories", async () => {
    const category = await createCategory({ code: "OT", name: "加班" });
    await setCategoryActive(category.id, false);
    await createCategory({ code: "SICK", name: "病假" });

    const active = await listCategories(true);
    expect(active.map((c) => c.code)).toEqual(["SICK"]);
  });

  it("rejects deactivating a category that does not exist", async () => {
    await expect(setCategoryActive("missing-id", false)).rejects.toMatchObject({ status: 404 });
  });
});
