import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import { listOvertimeScoreRules, updateOvertimeScoreRule } from "./overtime-score-rules";
import { prisma } from "./prisma";

afterEach(async () => {
  await resetDb();
});

// FR-7 固定值：平日加班 2 筆、假日加班 3 筆。
async function seedFixedRules() {
  const rows = [
    { overtimeType: "weekday", minHours: 2, maxHours: 2, points: 25, pointsPerExtraHour: null, sortOrder: 1 },
    { overtimeType: "weekday", minHours: 3, maxHours: null, points: 40, pointsPerExtraHour: null, sortOrder: 2 },
    { overtimeType: "holiday", minHours: 4, maxHours: 7, points: 50, pointsPerExtraHour: null, sortOrder: 1 },
    { overtimeType: "holiday", minHours: 8, maxHours: 8, points: 100, pointsPerExtraHour: null, sortOrder: 2 },
    { overtimeType: "holiday", minHours: 9, maxHours: null, points: 100, pointsPerExtraHour: 10, sortOrder: 3 },
  ];
  return Promise.all(
    rows.map((r) => prisma.overtimeScoreRule.create({ data: { ...r, updatedBy: "system-seed" } }))
  );
}

describe("listOvertimeScoreRules", () => {
  it("returns weekday rules first, then holiday, each sorted by sortOrder (FR-7)", async () => {
    await seedFixedRules();

    const rules = await listOvertimeScoreRules();
    expect(rules.map((r) => [r.overtimeType, r.minHours, r.maxHours, r.points, r.pointsPerExtraHour])).toEqual([
      ["weekday", 2, 2, 25, null],
      ["weekday", 3, null, 40, null],
      ["holiday", 4, 7, 50, null],
      ["holiday", 8, 8, 100, null],
      ["holiday", 9, null, 100, 10],
    ]);
  });
});

describe("updateOvertimeScoreRule", () => {
  it("updates points on one rule without affecting the others", async () => {
    const [weekday2h] = await seedFixedRules();

    await updateOvertimeScoreRule(weekday2h.id, { points: 30 }, "developer甲");

    const rules = await listOvertimeScoreRules();
    const updated = rules.find((r) => r.id === weekday2h.id);
    const others = rules.filter((r) => r.id !== weekday2h.id);
    expect(updated?.points).toBe(30);
    expect(others.every((r) => r.points !== 30 || r.id === weekday2h.id)).toBe(true);
    // 沒被改到的假日加班「超過8h」那筆維持原本的 pointsPerExtraHour
    const overEight = rules.find((r) => r.minHours === 9);
    expect(overEight?.pointsPerExtraHour).toBe(10);
  });

  it("updates pointsPerExtraHour on the 超過8h rule", async () => {
    const rules0 = await seedFixedRules();
    const overEight = rules0.find((r) => r.minHours === 9)!;

    await updateOvertimeScoreRule(overEight.id, { points: 100, pointsPerExtraHour: 15 }, "developer甲");

    const rules = await listOvertimeScoreRules();
    const updated = rules.find((r) => r.id === overEight.id);
    expect(updated?.pointsPerExtraHour).toBe(15);
  });

  it("records updatedBy and updatedAt on write (AC-10)", async () => {
    const [weekday2h] = await seedFixedRules();
    const before = new Date();

    const updated = await updateOvertimeScoreRule(weekday2h.id, { points: 30 }, "developer甲");

    expect(updated.updatedBy).toBe("developer甲");
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("rejects a non-existent rule id", async () => {
    await expect(
      updateOvertimeScoreRule("missing-id", { points: 10 }, "developer甲")
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a non-integer points value", async () => {
    const [weekday2h] = await seedFixedRules();
    await expect(
      updateOvertimeScoreRule(weekday2h.id, { points: 1.5 }, "developer甲")
    ).rejects.toMatchObject({ status: 400 });
  });
});
