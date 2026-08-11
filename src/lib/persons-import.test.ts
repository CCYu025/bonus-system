import { afterEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { resetDb } from "../../test/reset-db";
import { prisma } from "@/lib/prisma";
import {
  applyImportSelections,
  classifyImportRows,
  parseSftReport,
  type ImportSelection,
} from "./persons-import";

afterEach(async () => {
  await resetDb();
});

// Builds a minimal in-memory .xls buffer shaped like the real SFT report:
// two title rows, then a header row, then data rows — only 員工代號/姓名
// columns are populated since parseSftReport ignores everything else.
function buildSftBuffer(aoa: unknown[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "SFTR19_Excel");
  return XLSX.write(workbook, { type: "buffer", bookType: "xls" }) as Buffer;
}

function sftAoa(rows: { employeeId: string; name: string }[]): unknown[][] {
  return [
    ["", "", "", "", "", "示範公司"],
    ["", "", "", "", "", "生產日報表(人員)"],
    ["生產日期", "項次", "員工代號", "姓名", "報工單號"],
    ...rows.map((r) => ["2026-08-06", 1, r.employeeId, r.name, "D000-0001"]),
  ];
}

describe("parseSftReport", () => {
  it("extracts employeeId/name pairs, skipping the title rows", () => {
    const buffer = buildSftBuffer(
      sftAoa([
        { employeeId: "E100", name: "王小美" },
        { employeeId: "E200", name: "李小華" },
      ])
    );
    expect(parseSftReport(buffer)).toEqual([
      { employeeId: "E100", name: "王小美" },
      { employeeId: "E200", name: "李小華" },
    ]);
  });

  it("throws AppError(400) when the header row cannot be found", () => {
    const buffer = buildSftBuffer([["not", "the", "right", "columns"]]);
    expect(() => parseSftReport(buffer)).toThrow(expect.objectContaining({ status: 400 }));
  });

  it("skips a repeated header row appearing later in the data (page-break artifact)", () => {
    const aoa = [
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["生產日期", "項次", "員工代號", "姓名", "報工單號"],
      ["2026-08-06", 1, "E100", "王小美", "D000-0001"],
      ["生產日期", "項次", "員工代號", "姓名", "報工單號"], // repeated header
      ["2026-08-06", 2, "E200", "李小華", "D000-0002"],
    ];
    expect(parseSftReport(buildSftBuffer(aoa))).toEqual([
      { employeeId: "E100", name: "王小美" },
      { employeeId: "E200", name: "李小華" },
    ]);
  });

  it("dedupes multiple rows for the same employee into a single entry", () => {
    // The real report has one row per production line item, not per employee
    // — the same person can appear dozens of times for one day's work orders.
    const buffer = buildSftBuffer(
      sftAoa([
        { employeeId: "E100", name: "王小美" },
        { employeeId: "E100", name: "王小美" },
        { employeeId: "E100", name: "王小美" },
        { employeeId: "E200", name: "李小華" },
      ])
    );
    expect(parseSftReport(buffer)).toEqual([
      { employeeId: "E100", name: "王小美" },
      { employeeId: "E200", name: "李小華" },
    ]);
  });
});

describe("classifyImportRows", () => {
  it("classifies as 'replace' when name matches but employeeId differs (AC-2)", async () => {
    const person = await prisma.person.create({ data: { employeeId: "00013", name: "王小美" } });
    const result = await classifyImportRows([{ employeeId: "E100", name: "王小美" }]);
    expect(result).toEqual([
      {
        kind: "replace",
        personId: person.id,
        matchedBy: "name",
        currentEmployeeId: "00013",
        currentName: "王小美",
        importEmployeeId: "E100",
        importName: "王小美",
      },
    ]);
  });

  it("classifies as 'replace' when employeeId matches but name differs (AC-3)", async () => {
    const person = await prisma.person.create({ data: { employeeId: "E100", name: "王小美" } });
    const result = await classifyImportRows([{ employeeId: "E100", name: "王小美(改名)" }]);
    expect(result).toEqual([
      {
        kind: "replace",
        personId: person.id,
        matchedBy: "employeeId",
        currentEmployeeId: "E100",
        currentName: "王小美",
        importEmployeeId: "E100",
        importName: "王小美(改名)",
      },
    ]);
  });

  it("excludes a row from the result when both employeeId and name already match (AC-4)", async () => {
    await prisma.person.create({ data: { employeeId: "E100", name: "王小美" } });
    const result = await classifyImportRows([{ employeeId: "E100", name: "王小美" }]);
    expect(result).toEqual([]);
  });

  it("classifies as 'create' when neither employeeId nor name match any active person (AC-5)", async () => {
    const result = await classifyImportRows([{ employeeId: "E300", name: "張小強" }]);
    expect(result).toEqual([{ kind: "create", importEmployeeId: "E300", importName: "張小強" }]);
  });

  it("ignores terminated persons entirely when matching (AC-6)", async () => {
    await prisma.person.create({
      data: { employeeId: "E100", name: "王小美", status: "terminated" },
    });
    // Neither field should be treated as matching this terminated person, so
    // a differently-coded row with the same name is a 'create', not 'replace'.
    const result = await classifyImportRows([{ employeeId: "999999", name: "王小美" }]);
    expect(result).toEqual([{ kind: "create", importEmployeeId: "999999", importName: "王小美" }]);
  });

  it("flags as 'blocked' when a create-candidate's employeeId collides with a terminated person (AC-7)", async () => {
    await prisma.person.create({
      data: { employeeId: "E100", name: "舊員工", status: "terminated" },
    });
    const result = await classifyImportRows([{ employeeId: "E100", name: "新員工" }]);
    expect(result).toEqual([
      {
        kind: "blocked",
        importEmployeeId: "E100",
        importName: "新員工",
        reason: "工號 E100 已被離職人員「舊員工」占用",
      },
    ]);
  });

  it("does not write to the database (NFR-1)", async () => {
    await prisma.person.create({ data: { employeeId: "00013", name: "王小美" } });
    const before = await prisma.person.count();
    await classifyImportRows([
      { employeeId: "E100", name: "王小美" },
      { employeeId: "E300", name: "張小強" },
    ]);
    expect(await prisma.person.count()).toBe(before);
  });
});

describe("applyImportSelections", () => {
  it("updates only the employeeId when matchedBy is 'name', leaving name untouched (AC-10, FR-4)", async () => {
    const person = await prisma.person.create({ data: { employeeId: "00013", name: "王小美" } });
    const selection: ImportSelection = {
      kind: "replace",
      personId: person.id,
      matchedBy: "name",
      importEmployeeId: "E100",
      importName: "王小美",
    };
    await applyImportSelections([selection]);

    const updated = await prisma.person.findUniqueOrThrow({ where: { id: person.id } });
    expect(updated.employeeId).toBe("E100");
    expect(updated.name).toBe("王小美");
  });

  it("updates only the name when matchedBy is 'employeeId', leaving employeeId untouched (FR-4)", async () => {
    const person = await prisma.person.create({ data: { employeeId: "E100", name: "王小美" } });
    const selection: ImportSelection = {
      kind: "replace",
      personId: person.id,
      matchedBy: "employeeId",
      importEmployeeId: "E100",
      importName: "王小美(改名)",
    };
    await applyImportSelections([selection]);

    const updated = await prisma.person.findUniqueOrThrow({ where: { id: person.id } });
    expect(updated.employeeId).toBe("E100");
    expect(updated.name).toBe("王小美(改名)");
  });

  it("creates a new person for a 'create' selection", async () => {
    await applyImportSelections([
      { kind: "create", importEmployeeId: "E300", importName: "張小強" },
    ]);
    const created = await prisma.person.findUnique({ where: { employeeId: "E300" } });
    expect(created?.name).toBe("張小強");
  });

  it("leaves AttendanceRecord history untouched when replacing an employeeId (AC-10)", async () => {
    const person = await prisma.person.create({ data: { employeeId: "00013", name: "王小美" } });
    const category = await prisma.attendanceCategory.create({
      data: { code: "NORMAL", name: "正常出勤" },
    });
    const form = await prisma.attendanceForm.create({
      data: { date: "2026-08-06", status: "approved", activeDateKey: "2026-08-06" },
    });
    const record = await prisma.attendanceRecord.create({
      data: {
        formId: form.id,
        personId: person.id,
        date: "2026-08-06",
        categoryId: category.id,
        activeKey: `${person.id}:2026-08-06`,
      },
    });

    await applyImportSelections([
      {
        kind: "replace",
        personId: person.id,
        matchedBy: "name",
        importEmployeeId: "E100",
        importName: "王小美",
      },
    ]);

    const stillThere = await prisma.attendanceRecord.findUniqueOrThrow({
      where: { id: record.id },
    });
    expect(stillThere.personId).toBe(person.id);
  });

  it("applies only the passed-in selections, nothing else (AC-9)", async () => {
    const untouched = await prisma.person.create({ data: { employeeId: "00099", name: "不動" } });
    await applyImportSelections([
      { kind: "create", importEmployeeId: "E300", importName: "張小強" },
    ]);

    const stillUntouched = await prisma.person.findUniqueOrThrow({ where: { id: untouched.id } });
    expect(stillUntouched.employeeId).toBe("00099");
    expect(stillUntouched.name).toBe("不動");
    expect(await prisma.person.count()).toBe(2);
  });

  it("does nothing and does not throw when given an empty selection list (AC-11 support)", async () => {
    const before = await prisma.person.count();
    await applyImportSelections([]);
    expect(await prisma.person.count()).toBe(before);
  });

  it("rolls back the whole batch when one selection collides on employeeId (技術決策記錄 #6)", async () => {
    await prisma.person.create({
      data: { employeeId: "E100", name: "舊員工", status: "terminated" },
    });
    const person = await prisma.person.create({ data: { employeeId: "00013", name: "王小美" } });
    const before = await prisma.person.count();

    await expect(
      applyImportSelections([
        { kind: "create", importEmployeeId: "E300", importName: "張小強" },
        {
          kind: "replace",
          personId: person.id,
          matchedBy: "name",
          importEmployeeId: "E100", // collides with the terminated person above
          importName: "王小美",
        },
      ])
    ).rejects.toMatchObject({ status: 409 });

    // Transaction must roll back entirely — the 張小強 create must not have
    // survived even though it came before the failing item.
    expect(await prisma.person.count()).toBe(before);
    expect(await prisma.person.findUnique({ where: { employeeId: "E300" } })).toBeNull();
  });
});
