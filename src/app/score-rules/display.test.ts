import { describe, expect, it } from "vitest";
import { formatCategoryPoints, formatOvertimeRuleLabel } from "./display";

describe("formatCategoryPoints", () => {
  it("returns 未設定 for null (AC-3)", () => {
    expect(formatCategoryPoints(null)).toBe("未設定");
  });

  it("formats zero with an explicit + sign (特休 +0)", () => {
    expect(formatCategoryPoints(0)).toBe("+0");
  });

  it("formats a positive value with a + sign (正常出勤 +100)", () => {
    expect(formatCategoryPoints(100)).toBe("+100");
  });

  it("formats a negative value as-is (事假 -50)", () => {
    expect(formatCategoryPoints(-50)).toBe("-50");
  });
});

describe("formatOvertimeRuleLabel", () => {
  it("平日加班 2 小時 → +25 (AC-5)", () => {
    expect(
      formatOvertimeRuleLabel({ minHours: 2, maxHours: 2, points: 25, pointsPerExtraHour: null })
    ).toBe("2 小時 → +25");
  });

  it("平日加班 3 小時（含以上）→ +40 (AC-5)", () => {
    expect(
      formatOvertimeRuleLabel({ minHours: 3, maxHours: null, points: 40, pointsPerExtraHour: null })
    ).toBe("3 小時（含以上）→ +40");
  });

  it("假日加班 4–7 小時 → +50 (AC-6)", () => {
    expect(
      formatOvertimeRuleLabel({ minHours: 4, maxHours: 7, points: 50, pointsPerExtraHour: null })
    ).toBe("4–7 小時 → +50");
  });

  it("假日加班 8 小時 → +100 (AC-6)", () => {
    expect(
      formatOvertimeRuleLabel({ minHours: 8, maxHours: 8, points: 100, pointsPerExtraHour: null })
    ).toBe("8 小時 → +100");
  });

  it("假日加班 超過 8 小時 → 100 ＋ 每小時 10 (AC-6，逐字比照 spec 例句，不帶正負號)", () => {
    expect(
      formatOvertimeRuleLabel({ minHours: 9, maxHours: null, points: 100, pointsPerExtraHour: 10 })
    ).toBe("超過 8 小時 → 100 ＋ 每小時 10");
  });
});
