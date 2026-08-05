// @vitest-environment jsdom
// jsdom 元件測試（docs/2026-08-04-attendance-scoring-rules plan.md T-6/T-7/T-9）：
// 不整合真實 API，mock authFetch，只驗證「元素是否渲染」這類無法用純函式驗證的行為。
// 不 import @/lib/prisma，不觸發任何 DB 連線。
import "../../../test/jsdom-setup";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ScoreRulesPage from "./page";

vi.mock("@/lib/auth-client", () => ({
  authFetch: vi.fn(async (url: string) => {
    if (url === "/api/category-score-rules") {
      return {
        ok: true,
        json: async () => [
          {
            categoryId: "c1",
            categoryName: "正常出勤",
            points: 100,
            updatedAt: null,
            updatedBy: null,
            scoreSource: "category",
          },
          {
            categoryId: "c2",
            categoryName: "假日加班",
            points: null,
            updatedAt: null,
            updatedBy: null,
            scoreSource: "overtime",
          },
        ],
      };
    }
    if (url === "/api/overtime-score-rules") {
      return {
        ok: true,
        json: async () => [
          { id: "o1", overtimeType: "weekday", minHours: 2, maxHours: 2, points: 25, pointsPerExtraHour: null, sortOrder: 1 },
          { id: "o2", overtimeType: "weekday", minHours: 3, maxHours: null, points: 40, pointsPerExtraHour: null, sortOrder: 2 },
        ],
      };
    }
    return { ok: false, json: async () => ({}) };
  }),
}));

afterEach(() => {
  cleanup();
});

describe("ScoreRulesPage", () => {
  it("renders 出勤類別 and 加班 section headings (AC-1)", async () => {
    render(<ScoreRulesPage />);
    expect(await screen.findByRole("heading", { name: "出勤類別" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "加班" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "平日加班" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "假日加班" })).toBeInTheDocument();
  });

  it("shows the dual-condition explanation text under 假日加班 (AC-7)", async () => {
    render(<ScoreRulesPage />);
    expect(
      await screen.findByText(/此積分僅在出勤類別為假日加班，且加班時數達到對應門檻時才成立/)
    ).toBeInTheDocument();
  });

  it("does not render an input or edit button for the 假日加班 category row (AC-4)", async () => {
    render(<ScoreRulesPage />);
    await screen.findByText("積分由加班規則決定");

    const holidayRow = screen.getByText("積分由加班規則決定").closest("li");
    expect(holidayRow?.querySelector("input")).toBeNull();
    expect(holidayRow?.querySelector("button")).toBeNull();
  });
});
