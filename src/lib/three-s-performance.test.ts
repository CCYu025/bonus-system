import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import {
  createThreeSPerformance,
  listThreeSPerformances,
  updateThreeSPerformance,
} from "./three-s-performance";
import { prisma } from "./prisma";

afterEach(async () => {
  await resetDb();
});

describe("three-s-performance", () => {
  it("creates and lists 3S performance ratings", async () => {
    const created = await createThreeSPerformance({ code: "NORMAL", name: "正常", sortOrder: 1 });

    const all = await listThreeSPerformances();
    expect(all.map((c) => c.code)).toContain("NORMAL");
    expect(created.name).toBe("正常");
  });

  it("does not include a score/weight field on created records", async () => {
    const created = await createThreeSPerformance({ code: "NORMAL", name: "正常" });
    expect(Object.keys(created)).not.toContain("score");
    expect(Object.keys(created)).not.toContain("weight");
  });

  it("rejects creating with a duplicate code", async () => {
    await createThreeSPerformance({ code: "NORMAL", name: "正常" });
    await expect(
      createThreeSPerformance({ code: "NORMAL", name: "重複" })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects creating without code or name", async () => {
    await expect(createThreeSPerformance({ code: "", name: "正常" })).rejects.toMatchObject({
      status: 400,
    });
    await expect(createThreeSPerformance({ code: "NORMAL", name: "" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("listThreeSPerformances(true) only returns active ratings", async () => {
    const rating = await createThreeSPerformance({ code: "NORMAL", name: "正常" });
    await updateThreeSPerformance(rating.id, { isActive: false });
    await createThreeSPerformance({ code: "ABNORMAL", name: "異常" });

    const active = await listThreeSPerformances(true);
    expect(active.map((c) => c.code)).toEqual(["ABNORMAL"]);
  });

  it("updates code/name/sortOrder/isActive", async () => {
    const rating = await createThreeSPerformance({ code: "NORMAL", name: "正常" });

    const updated = await updateThreeSPerformance(rating.id, {
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

  it("rejects updating a rating that does not exist", async () => {
    await expect(
      updateThreeSPerformance("missing-id", { isActive: false })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects updating to a duplicate code", async () => {
    await createThreeSPerformance({ code: "NORMAL", name: "正常" });
    const other = await createThreeSPerformance({ code: "ABNORMAL", name: "異常" });

    await expect(
      updateThreeSPerformance(other.id, { code: "NORMAL" })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("persists via prisma directly as three_s_performance table", async () => {
    await createThreeSPerformance({ code: "NORMAL", name: "正常" });
    const rows = await prisma.threeSPerformance.findMany();
    expect(rows).toHaveLength(1);
  });

  // AC-8（docs/2026-08-03-attendance-leave-lock-sop-field）：「正常」為系統鎖定
  // 選項，不可編輯或停用。
  it("rejects editing a locked (isLocked=true) option", async () => {
    const rating = await createThreeSPerformance({ code: "NORMAL", name: "正常" });
    await prisma.threeSPerformance.update({
      where: { id: rating.id },
      data: { isLocked: true },
    });

    await expect(
      updateThreeSPerformance(rating.id, { name: "改名" })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects deactivating a locked (isLocked=true) option", async () => {
    const rating = await createThreeSPerformance({ code: "NORMAL", name: "正常" });
    await prisma.threeSPerformance.update({
      where: { id: rating.id },
      data: { isLocked: true },
    });

    await expect(
      updateThreeSPerformance(rating.id, { isActive: false })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("still allows editing a non-locked option (regression)", async () => {
    const rating = await createThreeSPerformance({ code: "NORMAL", name: "正常" });
    const updated = await updateThreeSPerformance(rating.id, { name: "正常2" });
    expect(updated.name).toBe("正常2");
  });
});
