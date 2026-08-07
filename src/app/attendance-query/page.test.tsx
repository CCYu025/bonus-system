// @vitest-environment jsdom
// jsdom 元件測試（比照 src/app/score-query/page.test.tsx）：mock authFetch，只驗證
// 「欄位是否渲染」「有值/無值時儲存格內容」這類無法用純函式驗證的行為。不 import
// @/lib/prisma，不觸發任何 DB 連線。
import "../../../test/jsdom-setup";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import AttendanceQueryPage from "./page";

const mockRows = [
  {
    date: "2026-01-01",
    employeeId: "E001",
    personName: "王小明",
    categoryId: "c1",
    categoryName: "正常出勤",
    note: "備註內容",
    actualQuantity: 42,
    overtimeHours: 3,
    complianceRatingName: "跨崗位",
    threeSPerformanceName: "正常",
    sopPerformanceName: "正常",
  },
  {
    date: "2026-01-02",
    employeeId: "E002",
    personName: "李小華",
    categoryId: "c2",
    categoryName: "事假",
    note: null,
    actualQuantity: null,
    overtimeHours: null,
    complianceRatingName: null,
    threeSPerformanceName: null,
    sopPerformanceName: null,
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
  render(<AttendanceQueryPage />);
  fireEvent.click(screen.getByRole("button", { name: "查詢" }));
  await screen.findByText("E001");
}

describe("AttendanceQueryPage", () => {
  it("renders the five extended-field columns after 出勤類別 (FR-1)", async () => {
    await search();
    const mainTable = screen.getByText("E001").closest("table")!;
    const headers = within(mainTable)
      .getAllByRole("columnheader")
      .map((el) => el.textContent);
    expect(headers).toEqual([
      "日期",
      "工號",
      "姓名",
      "出勤類別",
      "實際產量",
      "加班時數",
      "配合度",
      "3S表現",
      "SOP表現",
      "備註",
    ]);
  });

  it("displays the filled extended-field values (AC-1~AC-5)", async () => {
    await search();
    const row = screen.getByText("E001").closest("tr")!;
    const cells = within(row).getAllByRole("cell").map((el) => el.textContent);
    // 日期, 工號, 姓名, 出勤類別, 實際產量, 加班時數, 配合度, 3S表現, SOP表現, 備註
    expect(cells).toEqual([
      "2026-01-01",
      "E001",
      "王小明",
      "正常出勤",
      "42",
      "3",
      "跨崗位",
      "正常",
      "正常",
      "備註內容",
    ]);
  });

  it("shows blank (not 未填 text) for unfilled extended fields (AC-6/AC-7)", async () => {
    await search();
    const row = screen.getByText("E002").closest("tr")!;
    const cells = within(row).getAllByRole("cell").map((el) => el.textContent);
    expect(cells).toEqual([
      "2026-01-02",
      "E002",
      "李小華",
      "事假",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    expect(within(row).queryByText("未填")).toBeNull();
  });
});
