import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import {
  createSopPerformance,
  listSopPerformances,
  updateSopPerformance,
} from "./sop-performance";
import { prisma } from "./prisma";

afterEach(async () => {
  await resetDb();
});

describe("sop-performance", () => {
  it("creates and lists SOP performance options", async () => {
    const created = await createSopPerformance({ code: "NORMAL", name: "正常", sortOrder: 1 });

    const all = await listSopPerformances();
    expect(all.map((c) => c.code)).toContain("NORMAL");
    expect(created.name).toBe("正常");
  });

  it("does not include a score/weight field on created records", async () => {
    const created = await createSopPerformance({ code: "NORMAL", name: "正常" });
    expect(Object.keys(created)).not.toContain("score");
    expect(Object.keys(created)).not.toContain("weight");
  });

  it("rejects creating with a duplicate code", async () => {
    await createSopPerformance({ code: "NORMAL", name: "正常" });
    await expect(
      createSopPerformance({ code: "NORMAL", name: "重複" })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects creating without code or name", async () => {
    await expect(createSopPerformance({ code: "", name: "正常" })).rejects.toMatchObject({
      status: 400,
    });
    await expect(createSopPerformance({ code: "NORMAL", name: "" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("listSopPerformances(true) only returns active options", async () => {
    const option = await createSopPerformance({ code: "NORMAL", name: "正常" });
    await updateSopPerformance(option.id, { isActive: false });
    await createSopPerformance({ code: "ABNORMAL", name: "異常" });

    const active = await listSopPerformances(true);
    expect(active.map((c) => c.code)).toEqual(["ABNORMAL"]);
  });

  it("updates code/name/sortOrder/isActive", async () => {
    const option = await createSopPerformance({ code: "NORMAL", name: "正常" });

    const updated = await updateSopPerformance(option.id, {
      code: "NORMAL2",
      name: "正常表現",
      sortOrder: 5,
      isActive: false,
    });

    expect(updated.code).toBe("NORMAL2");
    expect(updated.name).toBe("正常表現");
    expect(updated.sortOrder).toBe(5);
    expect(updated.isActive).toBe(false);
  });

  it("rejects updating an option that does not exist", async () => {
    await expect(
      updateSopPerformance("missing-id", { isActive: false })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects updating to a duplicate code", async () => {
    await createSopPerformance({ code: "NORMAL", name: "正常" });
    const other = await createSopPerformance({ code: "ABNORMAL", name: "異常" });

    await expect(
      updateSopPerformance(other.id, { code: "NORMAL" })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("persists via prisma directly as sop_performance table", async () => {
    await createSopPerformance({ code: "NORMAL", name: "正常" });
    const rows = await prisma.sopPerformance.findMany();
    expect(rows).toHaveLength(1);
  });

  // AC-8：「正常」為系統鎖定選項，不可編輯或停用。
  it("rejects editing a locked (isLocked=true) option", async () => {
    const option = await createSopPerformance({ code: "NORMAL", name: "正常" });
    await prisma.sopPerformance.update({ where: { id: option.id }, data: { isLocked: true } });

    await expect(
      updateSopPerformance(option.id, { name: "改名" })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects deactivating a locked (isLocked=true) option", async () => {
    const option = await createSopPerformance({ code: "NORMAL", name: "正常" });
    await prisma.sopPerformance.update({ where: { id: option.id }, data: { isLocked: true } });

    await expect(
      updateSopPerformance(option.id, { isActive: false })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("still allows editing a non-locked option (regression)", async () => {
    const option = await createSopPerformance({ code: "NORMAL", name: "正常" });
    const updated = await updateSopPerformance(option.id, { name: "正常2" });
    expect(updated.name).toBe("正常2");
  });
});
