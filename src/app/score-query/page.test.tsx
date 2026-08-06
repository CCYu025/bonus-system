// @vitest-environment jsdom
// jsdom 元件測試（比照 src/app/score-rules/page.test.tsx）：mock authFetch，只驗證
// 「元素是否渲染」「點擊後是否展開/收合」這類無法用純函式驗證的行為。不 import
// @/lib/prisma，不觸發任何 DB 連線。
import "../../../test/jsdom-setup";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import ScoreQueryPage from "./page";

const mockRows = [
  {
    employeeId: "E001",
    personName: "王小明",
    categoryScore: 200,
    overtimeScore: 25,
    totalScore: 225,
    records: [
      {
        date: "2026-01-02",
        categoryId: "c1",
        categoryName: "正常出勤",
        categoryPoints: 100,
        overtimeHours: null,
        overtimePoints: 0,
        subtotal: 100,
      },
      {
        date: "2026-01-10",
        categoryId: "c1",
        categoryName: "正常出勤",
        categoryPoints: 100,
        overtimeHours: 2,
        overtimePoints: 25,
        subtotal: 125,
      },
    ],
  },
  {
    employeeId: "E002",
    personName: "李小華",
    categoryScore: 0,
    overtimeScore: 0,
    totalScore: 0,
    records: [],
  },
];

vi.mock("@/lib/auth-client", () => ({
  authFetch: vi.fn(async () => ({
    ok: true,
    json: async () => mockRows,
  })),
}));

afterEach(() => {
  cleanup();
});

async function search() {
  render(<ScoreQueryPage />);
  fireEvent.click(screen.getByRole("button", { name: "查詢" }));
  await screen.findByText("E001");
}

describe("ScoreQueryPage", () => {
  it("only has a month filter, no name/category dropdowns (Scope)", () => {
    render(<ScoreQueryPage />);
    expect(document.querySelectorAll('input[type="month"]')).toHaveLength(1);
    expect(document.querySelectorAll('input:not([type="month"])')).toHaveLength(0);
    expect(document.querySelectorAll("select")).toHaveLength(0);
  });

  it("renders the summary table with 工號/姓名/出勤類別分/加班分/總分 columns (AC-1)", async () => {
    await search();
    expect(screen.getByRole("columnheader", { name: "工號" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "姓名" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "出勤類別分" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "加班分" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "總分" })).toBeInTheDocument();
  });

  it("renders rows in the order returned by the API, including a 0-score person (AC-8 / AC-10)", async () => {
    await search();
    const rows = screen.getAllByRole("row").slice(1); // drop header row
    // Each summary row is followed conditionally by a detail row when expanded;
    // with nothing expanded yet there should be exactly 2 body rows.
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("E001")).toBeInTheDocument();
    expect(within(rows[0]).getByText("225")).toBeInTheDocument();
    expect(within(rows[1]).getByText("E002")).toBeInTheDocument();
    // 出勤類別分／加班分／總分三欄皆為 0（AC-10）。
    expect(within(rows[1]).getAllByText("0")).toHaveLength(3);
  });

  it("expands a person's row to show per-record detail on click, and collapses on a second click (AC-9)", async () => {
    await search();
    expect(screen.queryByText("2026-01-02")).toBeNull();

    fireEvent.click(screen.getByText("王小明").closest("tr")!);

    expect(await screen.findByText("2026-01-02")).toBeInTheDocument();
    expect(screen.getByText("2026-01-10")).toBeInTheDocument();
    // Detail row order follows the API's date-ascending order.
    const dateCells = screen.getAllByText(/^2026-01-/);
    expect(dateCells.map((el) => el.textContent)).toEqual(["2026-01-02", "2026-01-10"]);

    fireEvent.click(screen.getByText("王小明").closest("tr")!);
    expect(screen.queryByText("2026-01-02")).toBeNull();
  });

  it("shows a placeholder row when the expanded person has no records this month", async () => {
    await search();
    fireEvent.click(screen.getByText("李小華").closest("tr")!);
    expect(await screen.findByText("本月無出勤紀錄")).toBeInTheDocument();
  });
});
