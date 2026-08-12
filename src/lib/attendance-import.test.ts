// 純函式測試（docs/testing.md「filters.ts/display.ts」慣例）：不查 DB，不需要 resetDb()。
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  classifyAttendanceImportRows,
  parseAttendanceSftReport,
  type AttendanceImportRow,
  type FormPersonInput,
} from "./attendance-import";

function buildSftBuffer(aoa: unknown[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "SFTR19_Excel");
  return XLSX.write(workbook, { type: "buffer", bookType: "xls" }) as Buffer;
}

const HEADER = ["生產日期", "項次", "員工代號", "姓名", "數量"];

function aoaWithTitles(rows: unknown[][]): unknown[][] {
  return [["", "", "", "", "毅豐橡膠"], ["", "", "", "", "生產日報表(人員)"], HEADER, ...rows];
}

describe("parseAttendanceSftReport", () => {
  it("sums 數量 per 員工代號 across the whole file, ignoring 生產日期 (AC-3/AC-5, AMENDED 2026-08-11)", () => {
    // 夜班跨日：同一人的資料橫跨兩個生產日期，兩筆都要計入加總，不因日期不同被排除。
    const buffer = buildSftBuffer(
      aoaWithTitles([
        ["2026-08-10", 1, "000051", "陳玉葉", 10],
        ["2026-08-10", 2, "000051", "陳玉葉", 28],
        ["2026-08-11", 3, "000051", "陳玉葉", 999], // 跨日資料，仍要計入
        ["2026-08-10", 4, "000696", "呂志成", 5],
      ])
    );

    const result = parseAttendanceSftReport(buffer);
    expect(result).toEqual(
      expect.arrayContaining([
        { employeeId: "000051", name: "陳玉葉", quantity: 1037 },
        { employeeId: "000696", name: "呂志成", quantity: 5 },
      ])
    );
    expect(result).toHaveLength(2);
  });

  it("skips a repeated header row appearing later in the data (AC-4)", () => {
    const buffer = buildSftBuffer(
      aoaWithTitles([
        ["2026-08-10", 1, "000051", "陳玉葉", 10],
        HEADER, // 殘留重複表頭列
        ["2026-08-10", 2, "000051", "陳玉葉", 5],
      ])
    );

    const result = parseAttendanceSftReport(buffer);
    expect(result).toEqual([{ employeeId: "000051", name: "陳玉葉", quantity: 15 }]);
  });

  it("does not require a 生產日期 column to locate the header (AC-4, AMENDED 2026-08-11)", () => {
    const aoa = [
      ["", "", "", "", "毅豐橡膠"],
      ["員工代號", "姓名", "數量"],
      ["000051", "陳玉葉", 10],
    ];
    const buffer = buildSftBuffer(aoa);
    const result = parseAttendanceSftReport(buffer);
    expect(result).toEqual([{ employeeId: "000051", name: "陳玉葉", quantity: 10 }]);
  });

  it("throws AppError(400) when the header row cannot be found (NFR-2)", () => {
    const buffer = buildSftBuffer([["not", "the", "right", "columns"]]);
    expect(() => parseAttendanceSftReport(buffer)).toThrow(expect.objectContaining({ status: 400 }));
  });

  it("throws AppError(400) when the sheet only has 員工代號/姓名 without 數量 (NFR-2)", () => {
    // 比照既有 persons-import 的表頭格式，本功能要求多一欄「數量」才視為表頭。
    const buffer = buildSftBuffer([
      ["", "", "", "", ""],
      ["生產日期", "項次", "員工代號", "姓名", "報工單號"],
      ["2026-08-10", 1, "000051", "陳玉葉", "D000-0001"],
    ]);
    expect(() => parseAttendanceSftReport(buffer)).toThrow(expect.objectContaining({ status: 400 }));
  });

  it("returns 0 quantity for a non-numeric 數量 cell instead of throwing", () => {
    const buffer = buildSftBuffer(aoaWithTitles([["2026-08-10", 1, "000051", "陳玉葉", "N/A"]]));
    const result = parseAttendanceSftReport(buffer);
    expect(result).toEqual([{ employeeId: "000051", name: "陳玉葉", quantity: 0 }]);
  });
});

describe("classifyAttendanceImportRows", () => {
  const chen: FormPersonInput = {
    personId: "p-chen",
    employeeId: "000051",
    name: "陳玉葉",
    effectiveCategoryCode: "NORMAL",
  };
  const lu: FormPersonInput = {
    personId: "p-lu",
    employeeId: "000696",
    name: "呂志成",
    effectiveCategoryCode: "HOLIDAY_OVERTIME",
  };
  const wang: FormPersonInput = {
    personId: "p-wang",
    employeeId: "000700",
    name: "王小美",
    effectiveCategoryCode: "PERSONAL_LEAVE",
  };

  function row(overrides: Partial<AttendanceImportRow>): AttendanceImportRow {
    return { employeeId: "000051", name: "陳玉葉", quantity: 10, ...overrides };
  }

  it("classifies a full employeeId+name match as matched (AC-8)", () => {
    const result = classifyAttendanceImportRows([row({})], [chen, lu]);
    expect(result.matched).toEqual([{ personId: "p-chen", employeeId: "000051", name: "陳玉葉", quantity: 10 }]);
    expect(result.needsReview).toEqual([]);
  });

  it("applies 0 and negative/non-integer sums as-is without special-casing (AC-8a)", () => {
    const result = classifyAttendanceImportRows(
      [row({ quantity: 0 }), row({ employeeId: "000696", name: "呂志成", quantity: -3.5 })],
      [chen, lu]
    );
    expect(result.matched).toEqual(
      expect.arrayContaining([
        { personId: "p-chen", employeeId: "000051", name: "陳玉葉", quantity: 0 },
        { personId: "p-lu", employeeId: "000696", name: "呂志成", quantity: -3.5 },
      ])
    );
  });

  it("classifies a person whose effective category is not NORMAL/HOLIDAY_OVERTIME as skippedWrongCategory (AC-7)", () => {
    const result = classifyAttendanceImportRows(
      [row({ employeeId: "000700", name: "另一個名字" })], // 姓名不符也不影響，AC-7 不檢查姓名
      [wang]
    );
    expect(result.skippedWrongCategory).toEqual([{ personId: "p-wang", employeeId: "000700", name: "王小美" }]);
    expect(result.matched).toEqual([]);
    expect(result.needsReview).toEqual([]);
  });

  it("classifies employeeId-match-but-name-mismatch as needsReview with one candidate (AC-9)", () => {
    const result = classifyAttendanceImportRows([row({ name: "陳玉某" })], [chen]);
    expect(result.needsReview).toEqual([
      {
        reportEmployeeId: "000051",
        reportName: "陳玉某",
        quantity: 10,
        candidates: [{ personId: "p-chen", employeeId: "000051", name: "陳玉葉", matchedBy: "employeeId" }],
      },
    ]);
    expect(result.matched).toEqual([]);
  });

  it("classifies name-match-but-employeeId-mismatch as needsReview with one candidate (AC-10)", () => {
    const result = classifyAttendanceImportRows([row({ employeeId: "999999" })], [chen]);
    expect(result.needsReview).toEqual([
      {
        reportEmployeeId: "999999",
        reportName: "陳玉葉",
        quantity: 10,
        candidates: [{ personId: "p-chen", employeeId: "000051", name: "陳玉葉", matchedBy: "name" }],
      },
    ]);
  });

  it("classifies employeeId and name pointing to two different persons as needsReview with two candidates (AC-11)", () => {
    // employeeId 對到 lu，姓名卻對到 chen。
    const result = classifyAttendanceImportRows(
      [row({ employeeId: "000696", name: "陳玉葉" })],
      [chen, lu]
    );
    expect(result.needsReview).toEqual([
      {
        reportEmployeeId: "000696",
        reportName: "陳玉葉",
        quantity: 10,
        candidates: [
          { personId: "p-lu", employeeId: "000696", name: "呂志成", matchedBy: "employeeId" },
          { personId: "p-chen", employeeId: "000051", name: "陳玉葉", matchedBy: "name" },
        ],
      },
    ]);
  });

  it("classifies a target-category person with no matching report row as noExcelData (AC-12)", () => {
    const result = classifyAttendanceImportRows([row({ employeeId: "000696", name: "呂志成" })], [chen, lu]);
    expect(result.noExcelData).toEqual([{ personId: "p-chen", employeeId: "000051", name: "陳玉葉" }]);
  });

  it("classifies a report row matching nobody as unmatchedInExcel (AC-13)", () => {
    const result = classifyAttendanceImportRows(
      [row({ employeeId: "000999", name: "查無此人" })],
      [chen, lu]
    );
    expect(result.unmatchedInExcel).toEqual([
      { reportEmployeeId: "000999", reportName: "查無此人", quantity: 10 },
    ]);
  });

  it("keeps a person in noExcelData even when a different report row names them as a needsReview candidate (technical decision #4)", () => {
    // chen 自己的工號沒有出現在報表中（noExcelData），但報表另一筆資料的姓名剛好是
    // chen 的姓名、工號卻對到 lu（needsReview 的候選之一）——兩邊都要出現。
    const result = classifyAttendanceImportRows(
      [row({ employeeId: "000696", name: "陳玉葉" })],
      [chen, lu]
    );
    expect(result.noExcelData).toEqual([{ personId: "p-chen", employeeId: "000051", name: "陳玉葉" }]);
    expect(result.needsReview[0].candidates).toEqual(
      expect.arrayContaining([expect.objectContaining({ personId: "p-chen", matchedBy: "name" })])
    );
  });
});
