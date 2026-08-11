// @vitest-environment jsdom
// jsdom 元件測試（比照 src/app/score-rules/page.test.tsx）：mock authFetch，只驗證
// 「元素是否渲染」「勾選/送出行為」這類無法用純函式驗證的行為。不 import
// @/lib/prisma，不觸發任何 DB 連線。分類/套用邏輯本身由
// src/lib/persons-import.test.ts 覆蓋。
import "../../../test/jsdom-setup";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import PersonsPage from "./page";

const previewResponse = [
  {
    kind: "replace",
    personId: "p1",
    matchedBy: "name",
    currentEmployeeId: "00013",
    currentName: "王小美",
    importEmployeeId: "E100",
    importName: "王小美",
  },
  {
    kind: "create",
    importEmployeeId: "E300",
    importName: "張小強",
  },
  {
    kind: "blocked",
    importEmployeeId: "E100",
    importName: "新員工",
    reason: "工號 E100 已被離職人員「舊員工」占用",
  },
];

const applyCalls: unknown[] = [];

vi.mock("@/lib/auth-client", () => ({
  authFetch: vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/persons") {
      return {
        ok: true,
        json: async () => [{ id: "existing1", employeeId: "00013", name: "王小美", status: "active" }],
      };
    }
    if (url === "/api/persons/import/preview") {
      return { ok: true, json: async () => previewResponse };
    }
    if (url === "/api/persons/import/apply") {
      applyCalls.push(init?.body);
      return { ok: true, json: async () => ({}) };
    }
    return { ok: false, json: async () => ({}) };
  }),
}));

afterEach(() => {
  cleanup();
  applyCalls.length = 0;
});

async function uploadSampleFile() {
  const input = screen.getByLabelText("匯入 SFT 報表") as HTMLInputElement;
  const file = new File(["dummy"], "sft.xls", {
    type: "application/vnd.ms-excel",
  });
  fireEvent.change(input, { target: { files: [file] } });
  return screen.findByRole("heading", { name: "匯入預覽" });
}

describe("PersonsPage", () => {
  // AC-1
  it("renders the import entry between the create-person form and the person list", async () => {
    render(<PersonsPage />);
    await screen.findByText("00013"); // wait for initial /api/persons load to settle

    const createButton = screen.getByRole("button", { name: "新增人員" });
    const importInput = screen.getByLabelText("匯入 SFT 報表");
    const table = screen.getByRole("table");

    const position = createButton.compareDocumentPosition(importInput);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const importVsTable = importInput.compareDocumentPosition(table);
    expect(importVsTable & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // AC-2 / AC-3 / AC-5 / AC-7
  it("renders 取代/新增/無法匯入 rows with the existing-vs-imported comparison", async () => {
    render(<PersonsPage />);
    await uploadSampleFile();

    const rows = screen.getAllByRole("row").slice(1); // drop header row
    expect(within(rows[0]).getByText("取代")).toBeInTheDocument();
    expect(within(rows[0]).getByText("00013")).toBeInTheDocument();
    expect(within(rows[0]).getByText("E100")).toBeInTheDocument();

    expect(within(rows[1]).getByText("新增")).toBeInTheDocument();
    expect(within(rows[1]).getByText("E300")).toBeInTheDocument();
    expect(within(rows[1]).getByText("張小強")).toBeInTheDocument();

    expect(within(rows[2]).getByText("無法匯入")).toBeInTheDocument();
    expect(
      within(rows[2]).getByText("工號 E100 已被離職人員「舊員工」占用")
    ).toBeInTheDocument();
  });

  // AC-8
  it("starts every checkable row unchecked, and disables the 無法匯入 row's checkbox", async () => {
    render(<PersonsPage />);
    await uploadSampleFile();

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(false);
    expect(checkboxes[2].disabled).toBe(true);
  });

  // AC-9
  it("only sends the checked rows when 確認套用 is clicked", async () => {
    render(<PersonsPage />);
    await uploadSampleFile();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]); // check the 'create' row only

    fireEvent.click(screen.getByRole("button", { name: "確認套用" }));
    await vi.waitFor(() => expect(applyCalls).toHaveLength(1));

    const sent = JSON.parse(applyCalls[0] as string);
    expect(sent.selections).toEqual([
      { kind: "create", importEmployeeId: "E300", importName: "張小強" },
    ]);
  });

  // AC-11
  it("closes the preview and calls no API when 取消 is clicked", async () => {
    render(<PersonsPage />);
    await uploadSampleFile();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("heading", { name: "匯入預覽" })).not.toBeInTheDocument();
    expect(applyCalls).toHaveLength(0);
  });
});
