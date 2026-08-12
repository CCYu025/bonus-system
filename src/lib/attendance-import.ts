import * as XLSX from "xlsx";
import { AppError } from "@/lib/errors";

// T-1 / FR-3~FR-5: 出勤表單匯入 SFT 生產日報表的解析層。刻意獨立於
// src/lib/persons-import.ts 的 parseSftReport（只解析員工代號/姓名兩欄、
// 以最後一筆為準去重），因為這裡要多解析「數量」欄，且聚合語意
// 是「加總」而非「取最後一筆」，見 docs/2026-08-11-attendance-sft-production-import/plan.md
// 技術決策記錄第 1 項。
//
// AC-3（AMENDED 2026-08-11）：不依「生產日期」欄位過濾——夜班存在跨日情況，
// SFT 系統記錄的生產日期不可靠地對應到出勤表單所屬日期（例如晚班報工時間落在
// 隔天凌晨，生產日期會被記成隔天），依生產日期過濾會把實際屬於當天班次的產量
// 誤判為查無資料而排除。故加總範圍是整份上傳檔案，不解析、不使用生產日期欄位。
export type AttendanceImportRow = {
  employeeId: string;
  name: string;
  quantity: number;
};

// AC-4/NFR-2: 以內容定位表頭列（要求「員工代號」「姓名」「數量」三個欄名都在
// 同一列才視為表頭，比既有 parseSftReport 多要求「數量」，避免把只含員工代號/
// 姓名兩欄的人員主檔匯入報表誤判為本功能的表頭），跳過殘留重複表頭列，並依
// 員工代號加總整份檔案的數量欄（AC-3/AC-5，不依生產日期篩選）。
export function parseAttendanceSftReport(buffer: Buffer): AttendanceImportRow[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    throw new AppError(400, "檔案格式無法解析");
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new AppError(400, "檔案格式無法解析");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  const headerRowIndex = rows.findIndex(
    (row) =>
      Array.isArray(row) &&
      row.includes("員工代號") &&
      row.includes("姓名") &&
      row.includes("數量")
  );
  if (headerRowIndex === -1) throw new AppError(400, "檔案格式無法解析");

  const header = rows[headerRowIndex] as unknown[];
  const idxCode = header.indexOf("員工代號");
  const idxName = header.indexOf("姓名");
  const idxQty = header.indexOf("數量");

  const sums = new Map<string, { name: string; quantity: number }>();

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[] | undefined;
    if (!row) continue;

    const employeeId = String(row[idxCode] ?? "").trim();
    const name = String(row[idxName] ?? "").trim();
    if (!employeeId || !name) continue;
    if (employeeId === "員工代號" && name === "姓名") continue; // 殘留重複表頭列

    const qty = Number(row[idxQty]);
    const quantity = Number.isFinite(qty) ? qty : 0;

    const existing = sums.get(employeeId);
    if (existing) {
      existing.quantity += quantity;
      existing.name = name; // 同一員工代號多筆時姓名理論上一致，取最後一筆
    } else {
      sums.set(employeeId, { name, quantity });
    }
  }

  return Array.from(sums, ([employeeId, v]) => ({ employeeId, name: v.name, quantity: v.quantity }));
}

// T-2 / FR-6/FR-7: 匯入對象僅限這兩個出勤類別代碼（scripts/seed.cjs 的既有代碼）。
const TARGET_CATEGORY_CODES = ["NORMAL", "HOLIDAY_OVERTIME"];

export type FormPersonInput = {
  personId: string;
  employeeId: string;
  name: string;
  // 表單當下有效的出勤類別代碼（合併前端未儲存編輯後的值），未選為 null。
  effectiveCategoryCode: string | null;
};

export type MatchedImportItem = {
  personId: string;
  employeeId: string;
  name: string;
  quantity: number;
};

export type NeedsReviewCandidate = {
  personId: string;
  employeeId: string;
  name: string;
  matchedBy: "employeeId" | "name";
};

export type NeedsReviewImportItem = {
  reportEmployeeId: string;
  reportName: string;
  quantity: number;
  candidates: NeedsReviewCandidate[];
};

export type SkippedWrongCategoryItem = {
  personId: string;
  employeeId: string;
  name: string;
};

export type NoExcelDataItem = {
  personId: string;
  employeeId: string;
  name: string;
};

export type UnmatchedInExcelItem = {
  reportEmployeeId: string;
  reportName: string;
  quantity: number;
};

export type AttendanceImportClassification = {
  matched: MatchedImportItem[];
  needsReview: NeedsReviewImportItem[];
  skippedWrongCategory: SkippedWrongCategoryItem[];
  noExcelData: NoExcelDataItem[];
  unmatchedInExcel: UnmatchedInExcelItem[];
};

// 不查詢 DB 的純函式（技術決策記錄第 3 項）：DB 查詢與 payload 驗證留給呼叫端（route）。
// AC-6~AC-13／AC-8a：判斷順序見 docs/2026-08-11-attendance-sft-production-import/plan.md T-2。
export function classifyAttendanceImportRows(
  reportRows: AttendanceImportRow[],
  formPersons: FormPersonInput[]
): AttendanceImportClassification {
  const byEmployeeId = new Map(formPersons.map((p) => [p.employeeId, p]));
  const byName = new Map(formPersons.map((p) => [p.name, p]));

  const matched: MatchedImportItem[] = [];
  const needsReview: NeedsReviewImportItem[] = [];
  const skippedWrongCategory: SkippedWrongCategoryItem[] = [];
  const unmatchedInExcel: UnmatchedInExcelItem[] = [];

  for (const row of reportRows) {
    const byCode = byEmployeeId.get(row.employeeId);
    const byNameMatch = byName.get(row.name);

    if (byCode) {
      const isTargetCategory = TARGET_CATEGORY_CODES.includes(byCode.effectiveCategoryCode ?? "");
      if (!isTargetCategory) {
        // AC-7：不檢查姓名是否相符，Given 只要求代號查有資料。
        skippedWrongCategory.push({ personId: byCode.personId, employeeId: byCode.employeeId, name: byCode.name });
        continue;
      }

      if (byNameMatch && byNameMatch.personId === byCode.personId) {
        // AC-8/AC-8a：工號+姓名皆符合，加總結果原樣套用（含 0／負值／非整數）。
        matched.push({ personId: byCode.personId, employeeId: byCode.employeeId, name: byCode.name, quantity: row.quantity });
        continue;
      }

      // AC-9（姓名不符或不存在）／AC-11（姓名對應到不同人）。
      const candidates: NeedsReviewCandidate[] = [
        { personId: byCode.personId, employeeId: byCode.employeeId, name: byCode.name, matchedBy: "employeeId" },
      ];
      if (byNameMatch && byNameMatch.personId !== byCode.personId) {
        candidates.push({ personId: byNameMatch.personId, employeeId: byNameMatch.employeeId, name: byNameMatch.name, matchedBy: "name" });
      }
      needsReview.push({ reportEmployeeId: row.employeeId, reportName: row.name, quantity: row.quantity, candidates });
      continue;
    }

    if (byNameMatch) {
      // AC-10：僅姓名符合，不檢查候選人的出勤類別，交給人工判斷。
      needsReview.push({
        reportEmployeeId: row.employeeId,
        reportName: row.name,
        quantity: row.quantity,
        candidates: [
          { personId: byNameMatch.personId, employeeId: byNameMatch.employeeId, name: byNameMatch.name, matchedBy: "name" },
        ],
      });
      continue;
    }

    // AC-13：工號、姓名皆對不上表單任何人。
    unmatchedInExcel.push({ reportEmployeeId: row.employeeId, reportName: row.name, quantity: row.quantity });
  }

  // AC-12：與 needsReview 候選是否重疊無關（技術決策記錄第 4 項），只看自己的員工
  // 代號是否出現在報表中。
  const reportEmployeeIds = new Set(reportRows.map((r) => r.employeeId));
  const noExcelData: NoExcelDataItem[] = formPersons
    .filter(
      (p) =>
        TARGET_CATEGORY_CODES.includes(p.effectiveCategoryCode ?? "") && !reportEmployeeIds.has(p.employeeId)
    )
    .map((p) => ({ personId: p.personId, employeeId: p.employeeId, name: p.name }));

  return { matched, needsReview, skippedWrongCategory, noExcelData, unmatchedInExcel };
}
