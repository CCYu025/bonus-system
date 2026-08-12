// @vitest-environment jsdom
// jsdom 元件測試（比照 src/app/score-rules/page.test.tsx）：mock authFetch，只驗證
// 「元素是否渲染」「按鈕順序」「點擊後 state 是否更新」這類無法用純函式驗證的行為。
// 不 import @/lib/prisma，不觸發任何 DB 連線。分類/加總邏輯本身由
// src/lib/attendance-import.test.ts 覆蓋，權限/狀態限制由 route.test.ts 覆蓋。
import "../../../../test/jsdom-setup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import FormDetailPage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const CAT_NORMAL = { id: "cat-normal", code: "NORMAL", name: "正常出勤", isActive: true, locksExtendedFields: false };
const CAT_HOLIDAY = {
  id: "cat-holiday",
  code: "HOLIDAY_OVERTIME",
  name: "假日加班",
  isActive: true,
  locksExtendedFields: false,
};
const CAT_LEAVE = { id: "cat-leave", code: "PERSONAL_LEAVE", name: "事假", isActive: true, locksExtendedFields: true };

function baseRecords() {
  return [
    {
      id: "r1",
      employeeId: "000051",
      categoryId: CAT_NORMAL.id,
      note: null,
      overtimeHours: null,
      complianceRatingId: null,
      threeSPerformanceId: null,
      actualQuantity: 20,
      sopPerformanceId: null,
      voided: false,
      person: { name: "陳玉葉" },
      category: { id: CAT_NORMAL.id, name: CAT_NORMAL.name },
      complianceRating: null,
      threeSPerformance: null,
      sopPerformance: null,
    },
    {
      id: "r2",
      employeeId: "000696",
      categoryId: CAT_LEAVE.id,
      note: null,
      overtimeHours: null,
      complianceRatingId: null,
      threeSPerformanceId: null,
      actualQuantity: null,
      sopPerformanceId: null,
      voided: false,
      person: { name: "呂志成" },
      category: { id: CAT_LEAVE.id, name: CAT_LEAVE.name },
      complianceRating: null,
      threeSPerformance: null,
      sopPerformance: null,
    },
    {
      id: "r3",
      employeeId: "000800",
      categoryId: CAT_NORMAL.id,
      note: null,
      overtimeHours: null,
      complianceRatingId: null,
      threeSPerformanceId: null,
      actualQuantity: null,
      sopPerformanceId: null,
      voided: false,
      person: { name: "測試員C" },
      category: { id: CAT_NORMAL.id, name: CAT_NORMAL.name },
      complianceRating: null,
      threeSPerformance: null,
      sopPerformance: null,
    },
  ];
}

type FormDetailMock = {
  id: string;
  date: string;
  status: string;
  version: number;
  rejectReason: string | null;
  previousFormId: string | null;
  nextForm: null;
  records: ReturnType<typeof baseRecords>;
  auditLogs: unknown[];
};

type ImportCandidateMock = { personId: string; employeeId: string; name: string; matchedBy: "employeeId" | "name" };
type ImportResponseMock = {
  matched: { personId: string; employeeId: string; name: string; quantity: number }[];
  needsReview: {
    reportEmployeeId: string;
    reportName: string;
    quantity: number;
    candidates: ImportCandidateMock[];
  }[];
  skippedWrongCategory: { personId: string; employeeId: string; name: string }[];
  noExcelData: { personId: string; employeeId: string; name: string }[];
  unmatchedInExcel: { reportEmployeeId: string; reportName: string; quantity: number }[];
};

const emptyImportResponse: ImportResponseMock = {
  matched: [],
  needsReview: [],
  skippedWrongCategory: [],
  noExcelData: [],
  unmatchedInExcel: [],
};

let formDetail: FormDetailMock;
let importResponse: ImportResponseMock;
let lastImportEffectiveCategories: Record<string, string | null> | null;

const authFetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (url === "/api/forms/form-1") return { ok: true, json: async () => formDetail };
  if (url === "/api/categories?activeOnly=true") {
    return { ok: true, json: async () => [CAT_NORMAL, CAT_HOLIDAY, CAT_LEAVE] };
  }
  if (url === "/api/compliance-ratings?activeOnly=true") return { ok: true, json: async () => [] };
  if (url === "/api/three-s-performance?activeOnly=true") return { ok: true, json: async () => [] };
  if (url === "/api/sop-performance?activeOnly=true") return { ok: true, json: async () => [] };
  if (url === "/api/forms/form-1/import-sft") {
    const body = init?.body as FormData;
    lastImportEffectiveCategories = JSON.parse(String(body.get("effectiveCategories")));
    return { ok: true, json: async () => importResponse };
  }
  if (url === "/api/forms/form-1/records") {
    return { ok: true, json: async () => formDetail };
  }
  return { ok: false, json: async () => ({}) };
});

vi.mock("@/lib/auth-client", () => ({
  authFetch: (url: string, init?: RequestInit) => authFetchMock(url, init),
}));

beforeEach(() => {
  formDetail = {
    id: "form-1",
    date: "2026-08-10",
    status: "draft",
    version: 1,
    rejectReason: null,
    previousFormId: null,
    nextForm: null,
    records: baseRecords(),
    auditLogs: [],
  };
  importResponse = emptyImportResponse;
  lastImportEffectiveCategories = null;
  authFetchMock.mockClear();
});

afterEach(() => {
  cleanup();
});

async function renderPage() {
  // FormDetailPage 用 use(params) 消化一個 Promise，React 會先 suspend 再重試——
  // 需要包在 async act 裡讓那次 suspend/resolve 週期跑完，否則 findByText 會一直
  // 卡在 Suspense fallback（跟 load() 的 loading 狀態文字剛好相同，容易誤判）。
  await act(async () => {
    render(<FormDetailPage params={Promise.resolve({ id: "form-1" })} />);
  });
  await screen.findByText("陳玉葉");
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

function selectImportFile() {
  const file = new File(["dummy"], "sft.xls", { type: "application/vnd.ms-excel" });
  fireEvent.change(fileInput(), { target: { files: [file] } });
}

describe("匯入SFT生產日報表按鈕 (AC-1/AC-2/AC-19)", () => {
  it("renders the button to the left of 儲存草稿, and 儲存草稿 before 確認送出待審", async () => {
    await renderPage();
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    const importIdx = buttons.indexOf("匯入SFT生產日報表");
    const saveIdx = buttons.indexOf("儲存草稿");
    const submitIdx = buttons.indexOf("確認送出待審");
    expect(importIdx).toBeGreaterThanOrEqual(0);
    expect(importIdx).toBeLessThan(saveIdx);
    expect(saveIdx).toBeLessThan(submitIdx);
  });

  it("does not render the import button when the form is approved (AC-2)", async () => {
    formDetail.status = "approved";
    await renderPage();
    expect(screen.queryByRole("button", { name: "匯入SFT生產日報表" })).toBeNull();
  });

  it("presents a native file input and never auto-triggers an import request (AC-19)", async () => {
    await renderPage();
    const input = fileInput();
    expect(input).not.toBeNull();
    expect(input.type).toBe("file");
    expect(authFetchMock).not.toHaveBeenCalledWith(
      "/api/forms/form-1/import-sft",
      expect.anything()
    );
  });
});

describe("確認摘要畫面 (T-5, AC-7/AC-9~AC-14)", () => {
  it("renders all five classification buckets", async () => {
    importResponse = {
      matched: [{ personId: "p1", employeeId: "000051", name: "陳玉葉", quantity: 38 }],
      needsReview: [
        {
          reportEmployeeId: "000700",
          reportName: "王小美",
          quantity: 5,
          candidates: [{ personId: "p700", employeeId: "000700", name: "王大美", matchedBy: "employeeId" }],
        },
      ],
      skippedWrongCategory: [{ personId: "p2", employeeId: "000696", name: "呂志成" }],
      noExcelData: [{ personId: "p3", employeeId: "000800", name: "測試員C" }],
      unmatchedInExcel: [{ reportEmployeeId: "000999", reportName: "查無此人", quantity: 7 }],
    };
    await renderPage();
    selectImportFile();

    // matched + AC-14（既有值 20 應標示將被覆蓋）
    expect(await screen.findByText("000051 陳玉葉：38 將被覆蓋（原值：20 → 新值：38）")).toBeInTheDocument();

    // needsReview（AC-9/10/11 共用同一種呈現方式）
    expect(
      screen.getByText("報表工號 000700／姓名 王小美／數量 5 候選：王大美（000700）")
    ).toBeInTheDocument();

    // skippedWrongCategory（AC-7）
    expect(screen.getByText("出勤類別不符，未匯入（1 人）")).toBeInTheDocument();
    expect(screen.getByText("000696 呂志成")).toBeInTheDocument();

    // noExcelData（AC-12）
    expect(screen.getByText("報表查無資料，維持原值（1 人）")).toBeInTheDocument();
    expect(screen.getByText("000800 測試員C")).toBeInTheDocument();

    // unmatchedInExcel（AC-13）
    expect(screen.getByText("報表資料查無對應人員（1 筆）")).toBeInTheDocument();
    expect(screen.getByText("000999 查無此人 數量 7")).toBeInTheDocument();
  });

  it("does not show the 將被覆蓋 note for a matched person whose actualQuantity is currently empty", async () => {
    importResponse = {
      ...emptyImportResponse,
      matched: [{ personId: "p3", employeeId: "000800", name: "測試員C", quantity: 12 }],
    };
    await renderPage();
    selectImportFile();

    expect(await screen.findByText("000800 測試員C：12")).toBeInTheDocument();
    expect(screen.queryByText(/將被覆蓋/)).toBeNull();
  });
});

describe("確認套用寫入 edits state (T-6, AC-6/AC-8/AC-8a/AC-16)", () => {
  it("writes 0 and negative matched quantities into the actualQuantity input as-is (AC-8/AC-8a)", async () => {
    importResponse = {
      ...emptyImportResponse,
      matched: [{ personId: "p3", employeeId: "000800", name: "測試員C", quantity: 0 }],
    };
    await renderPage();
    selectImportFile();
    await screen.findByText("000800 測試員C：0");

    fireEvent.click(screen.getByRole("button", { name: "確認套用" }));

    const row = screen.getByText("000800").closest("tr")!;
    const input = row.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input.value).toBe("0");
  });

  it("does not call the save API when applying an import (AC-16)", async () => {
    importResponse = {
      ...emptyImportResponse,
      matched: [{ personId: "p1", employeeId: "000051", name: "陳玉葉", quantity: 55 }],
    };
    await renderPage();
    selectImportFile();
    await screen.findByText(/000051 陳玉葉：55/);

    fireEvent.click(screen.getByRole("button", { name: "確認套用" }));

    expect(authFetchMock).not.toHaveBeenCalledWith(
      "/api/forms/form-1/records",
      expect.anything()
    );
    // 確認摘要關閉，但表格上的值已透過 edits state 反映
    expect(screen.queryByText("匯入SFT生產日報表 — 確認套用")).toBeNull();
    const row = screen.getByText("000051").closest("tr")!;
    const input = row.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input.value).toBe("55");
  });

  it("sends the on-screen (unsaved) effective category, not the record's saved categoryId (AC-6)", async () => {
    await renderPage();

    // 000696（呂志成）DB 上是事假（cat-leave），畫面上先改成正常出勤，但不儲存。
    const leaveRow = screen.getByText("000696").closest("tr")!;
    const select = leaveRow.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: CAT_NORMAL.id } });

    selectImportFile();
    await vi.waitFor(() => expect(lastImportEffectiveCategories).not.toBeNull());

    expect(lastImportEffectiveCategories!["000696"]).toBe(CAT_NORMAL.id);
    expect(lastImportEffectiveCategories!["000051"]).toBe(CAT_NORMAL.id); // 未異動則沿用表單已存值
  });
});
