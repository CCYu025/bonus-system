// @vitest-environment jsdom
// jsdom 元件測試：驗證 spec.md AC-9——環狀圖只用正值計算佔比，總分置中顯示
// 「含負值影響後的真實總和」，圖例無條件列出全部五項並標示負值。
import "../../../test/jsdom-setup";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import DonutChart from "./donut-chart";
import type { PersonScoreSummary } from "@/lib/score-query";

afterEach(() => {
  cleanup();
});

function makeSummary(overrides: Partial<PersonScoreSummary> = {}): PersonScoreSummary {
  return {
    employeeId: "000696",
    personName: "呂志成",
    categoryScore: 100,
    overtimeScore: 25,
    complianceScore: 20,
    threeSScore: 0,
    sopScore: -10,
    totalScore: 135,
    records: [],
    ...overrides,
  };
}

describe("DonutChart", () => {
  it("shows the true total (including negative categories) in the center, not the positive-only sum", () => {
    const summary = makeSummary();
    render(<DonutChart summary={summary} />);
    // positive-only sum would be 145 (100+25+20); the real total is 135.
    expect(screen.getByText("135")).toBeInTheDocument();
  });

  it("renders a ring segment only for categories with a positive value", () => {
    const summary = makeSummary();
    const { container } = render(<DonutChart summary={summary} />);
    const ringCircles = container.querySelectorAll("circle[stroke-dasharray]");
    // 出勤分/加班分/配合度分 are positive (3); 3S分=0 and SOP分=-10 are excluded.
    expect(ringCircles.length).toBe(3);
  });

  it("lists all five categories in the legend, including zero and negative values", () => {
    const summary = makeSummary();
    render(<DonutChart summary={summary} />);
    expect(screen.getByText("出勤類別分")).toBeInTheDocument();
    expect(screen.getByText("加班分")).toBeInTheDocument();
    expect(screen.getByText("配合度分")).toBeInTheDocument();
    expect(screen.getByText("3S分")).toBeInTheDocument();
    expect(screen.getByText("SOP分")).toBeInTheDocument();
    expect(screen.getByText("-10")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders no ring segments when every category is zero or negative", () => {
    const summary = makeSummary({
      categoryScore: 0,
      overtimeScore: 0,
      complianceScore: 0,
      threeSScore: -5,
      sopScore: -5,
      totalScore: -10,
    });
    const { container } = render(<DonutChart summary={summary} />);
    expect(container.querySelectorAll("circle[stroke-dasharray]").length).toBe(0);
    expect(screen.getByText("-10")).toBeInTheDocument();
  });
});
