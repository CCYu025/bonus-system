import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import {
  listComplianceRatingScoreRules,
  upsertComplianceRatingScoreRule,
} from "./compliance-rating-score-rules";
import { prisma } from "./prisma";

afterEach(async () => {
  await resetDb();
});

async function seedRating(code = "CROSS_POST", name = "跨崗位", sortOrder = 1) {
  return prisma.complianceRating.create({ data: { code, name, sortOrder } });
}

describe("listComplianceRatingScoreRules", () => {
  it("returns points: null for a rating with no rule set yet (AC-1)", async () => {
    await seedRating();

    const rules = await listComplianceRatingScoreRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].points).toBeNull();
  });

  it("returns the set points once a rule exists (AC-1)", async () => {
    const rating = await seedRating();
    await upsertComplianceRatingScoreRule(rating.id, 10, "developer甲");

    const rules = await listComplianceRatingScoreRules();
    expect(rules[0].points).toBe(10);
  });

  it("includes a newly created rating immediately (AC-5)", async () => {
    expect(await listComplianceRatingScoreRules()).toHaveLength(0);

    await seedRating();

    const rules = await listComplianceRatingScoreRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe("跨崗位");
    expect(rules[0].points).toBeNull();
  });

  it("reflects a renamed rating's current name without touching its points (AC-6)", async () => {
    const rating = await seedRating();
    await upsertComplianceRatingScoreRule(rating.id, 10, "developer甲");

    await prisma.complianceRating.update({ where: { id: rating.id }, data: { name: "跨部門支援" } });

    const rules = await listComplianceRatingScoreRules();
    expect(rules[0].name).toBe("跨部門支援");
    expect(rules[0].points).toBe(10);
  });

  it("keeps a disabled rating in the list, flagged isActive: false (AC-7)", async () => {
    const rating = await seedRating();
    await upsertComplianceRatingScoreRule(rating.id, 10, "developer甲");
    await prisma.complianceRating.update({ where: { id: rating.id }, data: { isActive: false } });

    const rules = await listComplianceRatingScoreRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].isActive).toBe(false);
    expect(rules[0].points).toBe(10);
  });
});

describe("upsertComplianceRatingScoreRule", () => {
  it("upserts on a second call for the same rating (update, not a duplicate row)", async () => {
    const rating = await seedRating();
    await upsertComplianceRatingScoreRule(rating.id, 10, "developer甲");
    await upsertComplianceRatingScoreRule(rating.id, 20, "developer乙");

    const rows = await prisma.complianceRatingScoreRule.findMany({
      where: { complianceRatingId: rating.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].points).toBe(20);
  });

  it("allows negative points", async () => {
    const rating = await seedRating();
    const rule = await upsertComplianceRatingScoreRule(rating.id, -5, "developer甲");
    expect(rule.points).toBe(-5);
  });

  it("rejects a non-existent rating", async () => {
    await expect(
      upsertComplianceRatingScoreRule("missing-id", 10, "developer甲")
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a non-integer points value", async () => {
    const rating = await seedRating();
    await expect(upsertComplianceRatingScoreRule(rating.id, 1.5, "developer甲")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects setting points for a disabled rating and leaves the existing value untouched (AC-8)", async () => {
    const rating = await seedRating();
    await upsertComplianceRatingScoreRule(rating.id, 10, "developer甲");
    await prisma.complianceRating.update({ where: { id: rating.id }, data: { isActive: false } });

    await expect(
      upsertComplianceRatingScoreRule(rating.id, 99, "developer乙")
    ).rejects.toMatchObject({ status: 400 });

    const rule = await prisma.complianceRatingScoreRule.findUnique({
      where: { complianceRatingId: rating.id },
    });
    expect(rule?.points).toBe(10);
  });

  it("allows editing again after the rating is re-enabled, preserving the prior points (AC-9)", async () => {
    const rating = await seedRating();
    await upsertComplianceRatingScoreRule(rating.id, 10, "developer甲");
    await prisma.complianceRating.update({ where: { id: rating.id }, data: { isActive: false } });
    await prisma.complianceRating.update({ where: { id: rating.id }, data: { isActive: true } });

    const beforeEdit = await listComplianceRatingScoreRules();
    expect(beforeEdit[0].points).toBe(10);

    const rule = await upsertComplianceRatingScoreRule(rating.id, 15, "developer乙");
    expect(rule.points).toBe(15);
  });

  it("records updatedBy and updatedAt on write", async () => {
    const rating = await seedRating();
    const before = new Date();

    const rule = await upsertComplianceRatingScoreRule(rating.id, 10, "developer甲");

    expect(rule.updatedBy).toBe("developer甲");
    expect(rule.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});
