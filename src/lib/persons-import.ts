import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { AppError, isPrismaUniqueConstraintError } from "@/lib/errors";

export type SftReportRow = {
  employeeId: string;
  name: string;
};

// T-1 / FR-2: only 員工代號/姓名 columns are used, everything else in the SFT
// report (production quantities, work orders, etc.) is ignored. The report has
// a couple of title rows before the real header, and — in the sample file —
// a stray repeated header row further down (page-break artifact from the
// source system's export), so we locate the header by content rather than by
// a fixed row index, and skip any data row that is itself a repeated header.
//
// The report has one row per production line item, not one row per employee —
// the same 員工代號 appears dozens of times (real sample: 444 rows, 21 distinct
// employees). classifyImportRows operates on distinct employees, so dedupe
// here rather than pushing that responsibility onto every caller; last
// occurrence wins for the name, in case a later row reflects a correction.
export function parseSftReport(buffer: Buffer): SftReportRow[] {
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
    (row) => Array.isArray(row) && row.includes("員工代號") && row.includes("姓名")
  );
  if (headerRowIndex === -1) throw new AppError(400, "檔案格式無法解析");

  const header = rows[headerRowIndex] as unknown[];
  const idxCode = header.indexOf("員工代號");
  const idxName = header.indexOf("姓名");

  const byEmployeeId = new Map<string, string>();
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[] | undefined;
    if (!row) continue;
    const employeeId = String(row[idxCode] ?? "").trim();
    const name = String(row[idxName] ?? "").trim();
    if (!employeeId || !name) continue;
    if (employeeId === "員工代號" && name === "姓名") continue; // repeated header row
    byEmployeeId.set(employeeId, name);
  }
  return Array.from(byEmployeeId, ([employeeId, name]) => ({ employeeId, name }));
}

export type ImportClassification =
  | {
      kind: "replace";
      personId: string;
      matchedBy: "employeeId" | "name";
      currentEmployeeId: string;
      currentName: string;
      importEmployeeId: string;
      importName: string;
    }
  | {
      kind: "create";
      importEmployeeId: string;
      importName: string;
    }
  | {
      kind: "blocked";
      importEmployeeId: string;
      importName: string;
      reason: string;
    };

// T-2 / FR-3: classify every parsed row against the current *active* roster
// only (AC-6 — terminated persons are out of the matching scope entirely).
// - both employeeId and name already match the same active person → no-op,
//   excluded from the result (AC-4).
// - exactly one of the two fields matches an active person → "replace"
//   (AC-2 / AC-3); which field gets overwritten is decided in
//   applyImportSelections, based on matchedBy (FR-4).
// - neither matches → "create" (AC-5), unless the employeeId collides with a
//   terminated person's existing record, in which case it's "blocked" (AC-7).
// Read-only: this function never writes to the database (NFR-1).
export async function classifyImportRows(rows: SftReportRow[]): Promise<ImportClassification[]> {
  const [activePersons, terminatedPersons] = await Promise.all([
    prisma.person.findMany({ where: { status: "active" } }),
    prisma.person.findMany({ where: { status: "terminated" } }),
  ]);

  const activeByEmployeeId = new Map(activePersons.map((p) => [p.employeeId, p]));
  const activeByName = new Map(activePersons.map((p) => [p.name, p]));
  const terminatedByEmployeeId = new Map(terminatedPersons.map((p) => [p.employeeId, p]));

  const results: ImportClassification[] = [];

  for (const row of rows) {
    const byCode = activeByEmployeeId.get(row.employeeId);
    const byName = activeByName.get(row.name);

    if (byCode && byName && byCode.id === byName.id) {
      continue; // AC-4
    }

    if (byCode && byCode.name !== row.name) {
      results.push({
        kind: "replace",
        personId: byCode.id,
        matchedBy: "employeeId",
        currentEmployeeId: byCode.employeeId,
        currentName: byCode.name,
        importEmployeeId: row.employeeId,
        importName: row.name,
      });
      continue; // AC-3
    }

    if (byName && byName.employeeId !== row.employeeId) {
      results.push({
        kind: "replace",
        personId: byName.id,
        matchedBy: "name",
        currentEmployeeId: byName.employeeId,
        currentName: byName.name,
        importEmployeeId: row.employeeId,
        importName: row.name,
      });
      continue; // AC-2
    }

    const blockedBy = terminatedByEmployeeId.get(row.employeeId);
    if (blockedBy) {
      results.push({
        kind: "blocked",
        importEmployeeId: row.employeeId,
        importName: row.name,
        reason: `工號 ${row.employeeId} 已被離職人員「${blockedBy.name}」占用`,
      });
      continue; // AC-7
    }

    results.push({ kind: "create", importEmployeeId: row.employeeId, importName: row.name }); // AC-5
  }

  return results;
}

export type ImportSelection =
  | {
      kind: "replace";
      personId: string;
      matchedBy: "employeeId" | "name";
      importEmployeeId: string;
      importName: string;
    }
  | {
      kind: "create";
      importEmployeeId: string;
      importName: string;
    };

// T-3 / FR-4 / FR-6 / NFR-2: applies only the selections the caller passes in
// (the frontend only sends checked items — see plan.md 技術決策記錄 #5), in a
// single transaction so a mid-batch failure rolls back cleanly (AC-9/AC-11).
export async function applyImportSelections(selections: ImportSelection[]) {
  try {
    return await prisma.$transaction(
      selections.map((s) => {
        if (s.kind === "replace") {
          // FR-4: only the field that differed from the existing record gets
          // overwritten; the field that already matched stays untouched.
          const data =
            s.matchedBy === "employeeId" ? { name: s.importName } : { employeeId: s.importEmployeeId };
          return prisma.person.update({ where: { id: s.personId }, data });
        }
        return prisma.person.create({
          data: { employeeId: s.importEmployeeId, name: s.importName },
        });
      })
    );
  } catch (err) {
    // Boundary case not covered by AC-7's blocked-check: a "replace" target's
    // new employeeId could still collide with a terminated person's existing
    // record (see plan.md 技術決策記錄 #6) — caught here the same way
    // createPerson already handles duplicate employeeId.
    if (isPrismaUniqueConstraintError(err)) {
      throw new AppError(409, "套用失敗：部分項次的工號與既有人員（含離職人員）衝突，請重新匯入確認");
    }
    throw err;
  }
}
