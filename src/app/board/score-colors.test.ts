// 純函式/常數測試（docs/testing.md「filters.ts/display.ts」慣例），不需要
// resetDb()。驗證 spec.md AC-9/AC-11 要求的「五項都有對應顏色、顏色不重複」。
import { describe, expect, it } from "vitest";
import { SCORE_CATEGORIES } from "./score-colors";

describe("SCORE_CATEGORIES", () => {
  it("covers all five PersonScoreSummary score fields", () => {
    const keys = SCORE_CATEGORIES.map((c) => c.key);
    expect(keys).toEqual([
      "categoryScore",
      "overtimeScore",
      "complianceScore",
      "threeSScore",
      "sopScore",
    ]);
  });

  it("assigns a distinct color to each category", () => {
    const colors = SCORE_CATEGORIES.map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("gives every category a non-empty label", () => {
    for (const c of SCORE_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0);
    }
  });
});
