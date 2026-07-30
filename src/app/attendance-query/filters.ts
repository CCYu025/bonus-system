export type AttendanceQueryRow = {
  date: string;
  employeeId: string;
  personName: string;
  categoryId: string | null;
  categoryName: string | null;
  note: string | null;
};

export const NO_CATEGORY = "__NONE__";

// T-4：姓名下拉選項以查詢結果實際出現的人員為主，依姓名排序去重。
export function derivePersonOptions(rows: AttendanceQueryRow[]): string[] {
  return Array.from(new Set(rows.map((r) => r.personName))).sort((a, b) =>
    a.localeCompare(b, "zh-Hant")
  );
}

// T-5：出勤類別下拉選項以查詢結果實際出現的類別為主，未填另立一個選項排在最後。
export function deriveCategoryOptions(rows: AttendanceQueryRow[]): [string, string][] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (r.categoryId) seen.set(r.categoryId, r.categoryName ?? r.categoryId);
  }
  const options = Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1], "zh-Hant"));
  if (rows.some((r) => !r.categoryId)) {
    options.push([NO_CATEGORY, "未填"]);
  }
  return options;
}

// T-4 / T-5：姓名、出勤類別皆為精確比對的前端篩選，取交集。
export function filterRows(
  rows: AttendanceQueryRow[],
  personFilter: string,
  categoryFilter: string
): AttendanceQueryRow[] {
  return rows.filter((r) => {
    const matchesPerson = !personFilter || r.personName === personFilter;
    const matchesCategory =
      !categoryFilter ||
      (categoryFilter === NO_CATEGORY ? !r.categoryId : r.categoryId === categoryFilter);
    return matchesPerson && matchesCategory;
  });
}

// T-6：類別小計依傳入的（已篩選）列即時計算。
export function computeCategorySubtotals(rows: AttendanceQueryRow[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const label = r.categoryName ?? "未填";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries());
}
