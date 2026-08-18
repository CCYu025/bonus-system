// @vitest-environment jsdom
// jsdom 元件測試：驗證 spec.md AC-2（載入即顯示當月完整排行榜，依總分排序）、
// AC-3（所選月份無資料時的明確提示）、AC-13/AC-14（響應式欄位）、AC-4（點選
// 人員開啟彈窗）。不 import @/lib/prisma，mock fetch 而非真的打 API。
import "../../../test/jsdom-setup";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import BoardPage from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// 已依 API 既有排序方式（總分由高到低）排好，前端不重新排序。
const rows = [
  {
    employeeId: "000051",
    personName: "陳玉葉",
    categoryScore: 120,
    overtimeScore: 40,
    complianceScore: 30,
    threeSScore: 10,
    sopScore: 10,
    totalScore: 210,
    records: [],
  },
  {
    employeeId: "000696",
    personName: "呂志成",
    categoryScore: 100,
    overtimeScore: 25,
    complianceScore: 20,
    threeSScore: 0,
    sopScore: -10,
    totalScore: 135,
    records: [],
  },
];

function mockFetch(data: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => data }))
  );
}

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  );
}

async function findTable() {
  return screen.findByRole("table", {}, { timeout: 2000 });
}

describe("BoardPage", () => {
  it("renders the full ranking sorted by total score, no employeeId input required (AC-2)", async () => {
    mockMatchMedia(false);
    mockFetch(rows);
    render(<BoardPage />);

    const table = await findTable();
    const bodyRows = within(table).getAllByRole("row").slice(1); // skip header row
    expect(within(bodyRows[0]).getByText("陳玉葉")).toBeInTheDocument();
    expect(within(bodyRows[1]).getByText("呂志成")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("工號")).toBeNull();
  });

  it('shows "該月份尚無資料" when the API returns an empty list (AC-3)', async () => {
    mockMatchMedia(false);
    mockFetch([]);
    render(<BoardPage />);
    expect(await screen.findByText("該月份尚無資料")).toBeInTheDocument();
  });

  it("shows only rank/name/total columns on a narrow screen (AC-13)", async () => {
    mockMatchMedia(true);
    mockFetch(rows);
    render(<BoardPage />);
    const table = await findTable();

    const headerRow = within(table).getAllByRole("row")[0];
    const headers = within(headerRow).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(["排名", "姓名", "總分"]);
  });

  it("shows the full column set on a wide screen (AC-14)", async () => {
    mockMatchMedia(false);
    mockFetch(rows);
    render(<BoardPage />);
    const table = await findTable();

    const headerRow = within(table).getAllByRole("row")[0];
    const headers = within(headerRow).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual([
      "排名",
      "姓名",
      "工號",
      "出勤類別分",
      "加班分",
      "配合度分",
      "3S分",
      "SOP分",
      "總分",
    ]);
  });

  it("opens the person modal when a row is clicked (AC-4)", async () => {
    mockMatchMedia(false);
    mockFetch(rows);
    render(<BoardPage />);
    const table = await findTable();

    const bodyRows = within(table).getAllByRole("row").slice(1);
    bodyRows[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("re-fetches and re-renders when the month is changed, without a full page reload (AC-12)", async () => {
    mockMatchMedia(false);
    const otherMonthRows = [
      {
        employeeId: "000800",
        personName: "測試員C",
        categoryScore: 50,
        overtimeScore: 0,
        complianceScore: 0,
        threeSScore: 0,
        sopScore: 0,
        totalScore: 50,
        records: [],
      },
    ];
    const fetchMock = vi.fn(async (url: string) => {
      const isFirstMonth = url.includes(new Date().toISOString().slice(0, 7));
      return { ok: true, json: async () => (isFirstMonth ? rows : otherMonthRows) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const reloadSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload: reloadSpy });

    render(<BoardPage />);
    let table = await findTable();
    expect(within(table).getByText("陳玉葉")).toBeInTheDocument();

    const monthInput = screen.getByLabelText("選擇月份");
    fireEvent.change(monthInput, { target: { value: "2026-01" } });

    table = await findTable();
    expect(await within(table).findByText("測試員C")).toBeInTheDocument();
    expect(within(table).queryByText("陳玉葉")).toBeNull();
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
