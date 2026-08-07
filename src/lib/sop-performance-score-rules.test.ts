import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import {
  listSopPerformanceScoreRules,
  upsertSopPerformanceScoreRule,
} from "./sop-performance-score-rules";
import { prisma } from "./prisma";

afterEach(async () => {
  await resetDb();
});

async function seedNormal(sortOrder = 0) {
  return prisma.sopPerformance.create({
    data: { code: "NORMAL", name: "正常", sortOrder, isLocked: true },
  });
}

async function seedPerformance(code = "ABNORMAL", name = "異常", sortOrder = 1) {
  return prisma.sopPerformance.create({ data: { code, name, sortOrder } });
}

describe("listSopPerformanceScoreRules", () => {
  it("returns points: null and isLocked: true for the locked '正常' item (AC-3)", async () => {
    await seedNormal();

    const rules = await listSopPerformanceScoreRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].isLocked).toBe(true);
    expect(rules[0].points).toBeNull();
  });

  it("returns isLocked: false and the set points for a normal item", async () => {
    const performance = await seedPerformance();
    await upsertSopPerformanceScoreRule(performance.id, 5, "developer甲");

    const rules = await listSopPerformanceScoreRules();
    const row = rules.find((r) => r.sopPerformanceId === performance.id);
    expect(row?.isLocked).toBe(false);
    expect(row?.points).toBe(5);
  });

  it("keeps a disabled item in the list, flagged isActive: false (AC-7)", async () => {
    const performance = await seedPerformance();
    await upsertSopPerformanceScoreRule(performance.id, 5, "developer甲");
    await prisma.sopPerformance.update({ where: { id: performance.id }, data: { isActive: false } });

    const rules = await listSopPerformanceScoreRules();
    const row = rules.find((r) => r.sopPerformanceId === performance.id);
    expect(row?.isActive).toBe(false);
    expect(row?.points).toBe(5);
  });
});

describe("upsertSopPerformanceScoreRule", () => {
  it("rejects setting points for the locked '正常' item, writes nothing (AC-4)", async () => {
    const normal = await seedNormal();

    await expect(upsertSopPerformanceScoreRule(normal.id, 100, "developer甲")).rejects.toMatchObject({
      status: 400,
    });

    const rule = await prisma.sopPerformanceScoreRule.findUnique({
      where: { sopPerformanceId: normal.id },
    });
    expect(rule).toBeNull();
  });

  it("rejects setting points for a disabled item and leaves the existing value untouched", async () => {
    const performance = await seedPerformance();
    await upsertSopPerformanceScoreRule(performance.id, 5, "developer甲");
    await prisma.sopPerformance.update({ where: { id: performance.id }, data: { isActive: false } });

    await expect(
      upsertSopPerformanceScoreRule(performance.id, 99, "developer乙")
    ).rejects.toMatchObject({ status: 400 });

    const rule = await prisma.sopPerformanceScoreRule.findUnique({
      where: { sopPerformanceId: performance.id },
    });
    expect(rule?.points).toBe(5);
  });

  it("rejects a non-existent item", async () => {
    await expect(
      upsertSopPerformanceScoreRule("missing-id", 10, "developer甲")
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a non-integer points value", async () => {
    const performance = await seedPerformance();
    await expect(
      upsertSopPerformanceScoreRule(performance.id, 1.5, "developer甲")
    ).rejects.toMatchObject({ status: 400 });
  });

  it("upserts on a second call for the same item (update, not a duplicate row)", async () => {
    const performance = await seedPerformance();
    await upsertSopPerformanceScoreRule(performance.id, 5, "developer甲");
    await upsertSopPerformanceScoreRule(performance.id, 8, "developer乙");

    const rows = await prisma.sopPerformanceScoreRule.findMany({
      where: { sopPerformanceId: performance.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].points).toBe(8);
  });
});
