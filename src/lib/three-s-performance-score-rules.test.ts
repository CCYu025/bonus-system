import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import {
  listThreeSPerformanceScoreRules,
  upsertThreeSPerformanceScoreRule,
} from "./three-s-performance-score-rules";
import { prisma } from "./prisma";

afterEach(async () => {
  await resetDb();
});

async function seedNormal(sortOrder = 0) {
  return prisma.threeSPerformance.create({
    data: { code: "NORMAL", name: "正常", sortOrder, isLocked: true },
  });
}

async function seedPerformance(code = "ABNORMAL", name = "異常", sortOrder = 1) {
  return prisma.threeSPerformance.create({ data: { code, name, sortOrder } });
}

describe("listThreeSPerformanceScoreRules", () => {
  it("returns points: null and isLocked: true for the locked '正常' item (AC-2)", async () => {
    await seedNormal();

    const rules = await listThreeSPerformanceScoreRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].isLocked).toBe(true);
    expect(rules[0].points).toBeNull();
  });

  it("returns isLocked: false and the set points for a normal item", async () => {
    const performance = await seedPerformance();
    await upsertThreeSPerformanceScoreRule(performance.id, 5, "developer甲");

    const rules = await listThreeSPerformanceScoreRules();
    const row = rules.find((r) => r.threeSPerformanceId === performance.id);
    expect(row?.isLocked).toBe(false);
    expect(row?.points).toBe(5);
  });

  it("keeps a disabled item in the list, flagged isActive: false (AC-7)", async () => {
    const performance = await seedPerformance();
    await upsertThreeSPerformanceScoreRule(performance.id, 5, "developer甲");
    await prisma.threeSPerformance.update({ where: { id: performance.id }, data: { isActive: false } });

    const rules = await listThreeSPerformanceScoreRules();
    const row = rules.find((r) => r.threeSPerformanceId === performance.id);
    expect(row?.isActive).toBe(false);
    expect(row?.points).toBe(5);
  });
});

describe("upsertThreeSPerformanceScoreRule", () => {
  it("rejects setting points for the locked '正常' item, writes nothing (AC-4)", async () => {
    const normal = await seedNormal();

    await expect(upsertThreeSPerformanceScoreRule(normal.id, 100, "developer甲")).rejects.toMatchObject({
      status: 400,
    });

    const rule = await prisma.threeSPerformanceScoreRule.findUnique({
      where: { threeSPerformanceId: normal.id },
    });
    expect(rule).toBeNull();
  });

  it("rejects setting points for a disabled item and leaves the existing value untouched", async () => {
    const performance = await seedPerformance();
    await upsertThreeSPerformanceScoreRule(performance.id, 5, "developer甲");
    await prisma.threeSPerformance.update({ where: { id: performance.id }, data: { isActive: false } });

    await expect(
      upsertThreeSPerformanceScoreRule(performance.id, 99, "developer乙")
    ).rejects.toMatchObject({ status: 400 });

    const rule = await prisma.threeSPerformanceScoreRule.findUnique({
      where: { threeSPerformanceId: performance.id },
    });
    expect(rule?.points).toBe(5);
  });

  it("rejects a non-existent item", async () => {
    await expect(
      upsertThreeSPerformanceScoreRule("missing-id", 10, "developer甲")
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a non-integer points value", async () => {
    const performance = await seedPerformance();
    await expect(
      upsertThreeSPerformanceScoreRule(performance.id, 1.5, "developer甲")
    ).rejects.toMatchObject({ status: 400 });
  });

  it("upserts on a second call for the same item (update, not a duplicate row)", async () => {
    const performance = await seedPerformance();
    await upsertThreeSPerformanceScoreRule(performance.id, 5, "developer甲");
    await upsertThreeSPerformanceScoreRule(performance.id, 8, "developer乙");

    const rows = await prisma.threeSPerformanceScoreRule.findMany({
      where: { threeSPerformanceId: performance.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].points).toBe(8);
  });
});
