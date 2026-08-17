// @vitest-environment jsdom
// jsdom 元件測試：驗證明細表格的渲染內容與捲動陰影邏輯本身（比對 scrollTop/
// clientHeight/scrollHeight 決定是否顯示陰影）。sticky 表頭與陰影在「真實瀏覽器
// 排版」下是否真的生效，另由 Playwright 測試覆蓋（plan.md T-10）——jsdom 沒有
// 真實版面尺寸，這裡只驗證邏輯分支本身正確。
import "../../../test/jsdom-setup";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DetailTable from "./detail-table";
import type { ScoreRecordDetail } from "@/lib/score-query";

afterEach(() => {
  cleanup();
});

function makeRecord(overrides: Partial<ScoreRecordDetail> = {}): ScoreRecordDetail {
  return {
    date: "2026-08-10",
    categoryId: "c1",
    categoryName: "正常出勤",
    categoryPoints: 100,
    overtimeHours: null,
    overtimePoints: 0,
    complianceRatingPoints: 0,
    threeSPerformancePoints: 0,
    sopPerformancePoints: 0,
    subtotal: 100,
    ...overrides,
  };
}

describe("DetailTable", () => {
  it("renders one row per record with the right values", () => {
    render(<DetailTable records={[makeRecord()]} />);
    expect(screen.getByText("2026-08-10")).toBeInTheDocument();
    expect(screen.getByText("正常出勤")).toBeInTheDocument();
  });

  it("renders a placeholder row when there are no records", () => {
    render(<DetailTable records={[]} />);
    expect(screen.getByText("本月無出勤紀錄")).toBeInTheDocument();
  });

  it("hides the scroll fade once scrolled to the bottom", () => {
    const records = Array.from({ length: 10 }, (_, i) => makeRecord({ date: `2026-08-${10 + i}` }));
    render(<DetailTable records={records} />);
    const area = screen.getByTestId("detail-scroll-area");
    const fade = screen.getByTestId("detail-scroll-fade");

    Object.defineProperty(area, "scrollTop", { value: 0, configurable: true });
    Object.defineProperty(area, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(area, "scrollHeight", { value: 500, configurable: true });
    fireEvent.scroll(area);
    expect(fade.style.opacity).toBe("1");

    Object.defineProperty(area, "scrollTop", { value: 300, configurable: true });
    fireEvent.scroll(area);
    expect(fade.style.opacity).toBe("0");
  });
});
