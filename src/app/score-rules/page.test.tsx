// @vitest-environment jsdom
// jsdom 元件測試（docs/2026-08-04-attendance-scoring-rules plan.md T-6/T-7/T-9）：
// 不整合真實 API，mock authFetch，只驗證「元素是否渲染」這類無法用純函式驗證的行為。
// 不 import @/lib/prisma，不觸發任何 DB 連線。
import "../../../test/jsdom-setup";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    if (url === "/api/compliance-rating-score-rules") {
      return {
        ok: true,
        json: async () => [
          { complianceRatingId: "cr1", name: "跨崗位", points: null, isActive: true },
        ],
      };
    }
    if (url === "/api/three-s-performance-score-rules") {
      return {
        ok: true,
        json: async () => [
          { threeSPerformanceId: "s1", name: "正常", points: null, isActive: true, isLocked: true },
          { threeSPerformanceId: "s2", name: "異常", points: null, isActive: false, isLocked: false },
        ],
      };
    }
    if (url === "/api/sop-performance-score-rules") {
      return {
        ok: true,
        json: async () => [
          { sopPerformanceId: "p1", name: "正常", points: null, isActive: true, isLocked: true },
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

  it("renders 配合度／3S表現／SOP表現 section headings, in that order after 出勤類別/加班", async () => {
    render(<ScoreRulesPage />);
    await screen.findByText("跨崗位");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["出勤類別", "加班", "配合度", "3S表現", "SOP表現"]);
  });

  it("does not render an input or button for the locked 正常 row in 3S表現 (AC-2)", async () => {
    render(<ScoreRulesPage />);
    await screen.findByText("跨崗位");

    const threeSSection = screen.getByRole("heading", { name: "3S表現" }).closest("section");
    const normalRow = within(threeSSection!).getByText("正常").closest("li");
    expect(within(normalRow!).getByText("系統鎖定，不可設定積分")).toBeInTheDocument();
    expect(normalRow?.querySelector("input")).toBeNull();
    expect(normalRow?.querySelector("button")).toBeNull();
  });

  it("does not render an input or button for the locked 正常 row in SOP表現 (AC-3)", async () => {
    render(<ScoreRulesPage />);
    await screen.findByText("跨崗位");

    const sopSection = screen.getByRole("heading", { name: "SOP表現" }).closest("section");
    const normalRow = within(sopSection!).getByText("正常").closest("li");
    expect(within(normalRow!).getByText("系統鎖定，不可設定積分")).toBeInTheDocument();
    expect(normalRow?.querySelector("input")).toBeNull();
    expect(normalRow?.querySelector("button")).toBeNull();
  });

  it("shows a 停用 badge and no input/button for a disabled 3S表現 item, even in edit mode (AC-7)", async () => {
    render(<ScoreRulesPage />);
    await screen.findByText("異常");

    fireEvent.click(screen.getByRole("button", { name: "切換為編輯模式" }));

    const disabledRow = screen.getByText("異常").closest("li");
    expect(within(disabledRow!).getByText("停用")).toBeInTheDocument();
    expect(disabledRow?.querySelector("input")).toBeNull();
    expect(disabledRow?.querySelector("button")).toBeNull();
  });
});
