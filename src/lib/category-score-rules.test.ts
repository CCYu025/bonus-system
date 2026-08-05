import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import { listCategoryScoreRules, upsertCategoryScoreRule } from "./category-score-rules";
import { prisma } from "./prisma";

afterEach(async () => {
  await resetDb();
});

async function seedCategory(code = "NORMAL", name = "正常出勤", sortOrder = 1) {
  return prisma.attendanceCategory.create({ data: { code, name, sortOrder } });
}

async function seedHolidayOvertimeCategory() {
  return prisma.attendanceCategory.create({
    data: { code: "HOLIDAY_OVERTIME", name: "假日加班", sortOrder: 5 },
  });
}

describe("listCategoryScoreRules", () => {
  it("returns points: null for a category with no rule set yet (AC-3)", async () => {
    await seedCategory();

    const rules = await listCategoryScoreRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].points).toBeNull();
  });

  it("includes 假日加班 as a row but with scoreSource: overtime and points always null (AC-4)", async () => {
    await seedCategory();
    await seedHolidayOvertimeCategory();

    const rules = await listCategoryScoreRules();
    expect(rules.map((r) => r.categoryName)).toEqual(["正常出勤", "假日加班"]);
    const holiday = rules.find((r) => r.categoryName === "假日加班");
    expect(holiday?.scoreSource).toBe("overtime");
    expect(holiday?.points).toBeNull();
  });

  it("marks a normal category's scoreSource as 'category'", async () => {
    await seedCategory();
    const rules = await listCategoryScoreRules();
    expect(rules[0].scoreSource).toBe("category");
  });

  it("excludes inactive categories", async () => {
    const category = await seedCategory();
    await prisma.attendanceCategory.update({ where: { id: category.id }, data: { isActive: false } });

    const rules = await listCategoryScoreRules();
    expect(rules).toHaveLength(0);
  });

  it("returns the set points once a rule exists", async () => {
    const category = await seedCategory();
    await upsertCategoryScoreRule(category.id, 100, "developer甲");

    const rules = await listCategoryScoreRules();
    expect(rules[0].points).toBe(100);
  });
});

describe("upsertCategoryScoreRule", () => {
  it("writes the points value without touching AttendanceCategory's own fields (AC-2)", async () => {
    const category = await seedCategory("SICK_LEAVE", "病假", 3);
    const before = await prisma.attendanceCategory.findUnique({ where: { id: category.id } });

    await upsertCategoryScoreRule(category.id, -20, "developer甲");

    const after = await prisma.attendanceCategory.findUnique({ where: { id: category.id } });
    expect(after).toMatchObject({
      code: before?.code,
      name: before?.name,
      sortOrder: before?.sortOrder,
      isActive: before?.isActive,
      locksExtendedFields: before?.locksExtendedFields,
    });

    const rule = await prisma.categoryScoreRule.findUnique({ where: { categoryId: category.id } });
    expect(rule?.points).toBe(-20);
  });

  it("allows negative points (事假 -50)", async () => {
    const category = await seedCategory("PERSONAL_LEAVE", "事假", 2);
    const rule = await upsertCategoryScoreRule(category.id, -50, "developer甲");
    expect(rule.points).toBe(-50);
  });

  it("upserts on a second call for the same category (update, not a duplicate row)", async () => {
    const category = await seedCategory();
    await upsertCategoryScoreRule(category.id, 100, "developer甲");
    await upsertCategoryScoreRule(category.id, 80, "developer乙");

    const rows = await prisma.categoryScoreRule.findMany({ where: { categoryId: category.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].points).toBe(80);
  });

  it("rejects setting points for the 假日加班 category (AC-4 backend guard)", async () => {
    const category = await seedHolidayOvertimeCategory();
    await expect(upsertCategoryScoreRule(category.id, 999, "developer甲")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects a non-existent category", async () => {
    await expect(upsertCategoryScoreRule("missing-id", 10, "developer甲")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("rejects a non-integer points value", async () => {
    const category = await seedCategory();
    await expect(upsertCategoryScoreRule(category.id, 1.5, "developer甲")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("records updatedBy and updatedAt on write (AC-10)", async () => {
    const category = await seedCategory();
    const before = new Date();

    const rule = await upsertCategoryScoreRule(category.id, 100, "developer甲");

    expect(rule.updatedBy).toBe("developer甲");
    expect(rule.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});
