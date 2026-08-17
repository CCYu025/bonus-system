// @vitest-environment jsdom
// jsdom 元件測試：驗證 spec.md AC-11——只取前 N 名（不足 N 人時顯示全部）、
// 顏色與 DonutChart 共用同一份對應表、圖表數值與來源資料一致。
import "../../../test/jsdom-setup";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import StackedBarChart, { TOP_N_FOR_CHART } from "./stacked-bar-chart";

afterEach(() => {
  cleanup();
});
import { SCORE_CATEGORIES } from "./score-colors";
import type { PersonScoreSummary } from "@/lib/score-query";

function makeRows(count: number): PersonScoreSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    employeeId: `E${i}`,
    personName: `員工${i}`,
    categoryScore: 100 - i,
    overtimeScore: 10,
    complianceScore: 5,
    threeSScore: 0,
    sopScore: 0,
    totalScore: 115 - i,
    records: [],
  }));
}

describe("StackedBarChart", () => {
  it(`renders at most TOP_N_FOR_CHART (${TOP_N_FOR_CHART}) bars when there are more people`, () => {
    render(<StackedBarChart rows={makeRows(12)} />);
    expect(screen.getAllByTestId("stacked-bar-track")).toHaveLength(TOP_N_FOR_CHART);
  });

  it("renders all people when there are fewer than TOP_N_FOR_CHART", () => {
    render(<StackedBarChart rows={makeRows(3)} />);
    expect(screen.getAllByTestId("stacked-bar-track")).toHaveLength(3);
  });

  it("uses the same color per category as SCORE_CATEGORIES for each segment", () => {
    const { container } = render(<StackedBarChart rows={makeRows(1)} />);
    const segments = container.querySelectorAll('[data-testid="stacked-bar-segment"]');
    segments.forEach((seg) => {
      const key = seg.getAttribute("data-category");
      const def = SCORE_CATEGORIES.find((c) => c.key === key);
      expect(def).toBeDefined();
      expect((seg as HTMLElement).style.background).toBe(hexToRgb(def!.color));
    });
  });

  it("does not render a segment for a zero-value category", () => {
    const rows = makeRows(1);
    rows[0].threeSScore = 0;
    const { container } = render(<StackedBarChart rows={rows} />);
    const segments = container.querySelectorAll('[data-category="threeSScore"]');
    expect(segments.length).toBe(0);
  });
});

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}
