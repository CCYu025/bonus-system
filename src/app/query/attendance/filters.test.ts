import { describe, expect, it } from "vitest";
import {
  NO_CATEGORY,
  computeCategorySubtotals,
  deriveCategoryOptions,
  derivePersonOptions,
  filterRows,
  type AttendanceQueryRow,
} from "./filters";

function row(overrides: Partial<AttendanceQueryRow>): AttendanceQueryRow {
  return {
    date: "2026-01-01",
    employeeId: "E001",
    personName: "王小明",
    categoryId: "cat-ot",
    categoryName: "加班",
    note: null,
    actualQuantity: null,
    overtimeHours: null,
    complianceRatingName: null,
    threeSPerformanceName: null,
    sopPerformanceName: null,
    ...overrides,
  };
}

describe("derivePersonOptions", () => {
  it("dedupes person names and returns them in a stable sorted order", () => {
    const rows = [
      row({ personName: "李小華" }),
      row({ personName: "王小明" }),
      row({ personName: "李小華" }),
    ];
    const result = derivePersonOptions(rows);
    expect(result).toHaveLength(2);
    expect(new Set(result)).toEqual(new Set(["李小華", "王小明"]));
    expect(result).toEqual([...result].sort((a, b) => a.localeCompare(b, "zh-Hant")));
  });

  it("returns an empty list for no rows", () => {
    expect(derivePersonOptions([])).toEqual([]);
  });
});

describe("deriveCategoryOptions", () => {
  it("dedupes by categoryId and returns a stable sorted order by name", () => {
    const rows = [
      row({ categoryId: "cat-leave", categoryName: "請假" }),
      row({ categoryId: "cat-ot", categoryName: "加班" }),
      row({ categoryId: "cat-ot", categoryName: "加班" }),
    ];
    const result = deriveCategoryOptions(rows);
    expect(result).toHaveLength(2);
    expect(new Set(result.map(([id]) => id))).toEqual(new Set(["cat-ot", "cat-leave"]));
    const names = result.map(([, name]) => name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "zh-Hant")));
  });

  it("appends a 未填 option last only when a null-category row exists", () => {
    const withNull = [
      row({ categoryId: "cat-ot", categoryName: "加班" }),
      row({ categoryId: null, categoryName: null }),
    ];
    expect(deriveCategoryOptions(withNull)).toEqual([
      ["cat-ot", "加班"],
      [NO_CATEGORY, "未填"],
    ]);

    const withoutNull = [row({ categoryId: "cat-ot", categoryName: "加班" })];
    expect(deriveCategoryOptions(withoutNull)).toEqual([["cat-ot", "加班"]]);
  });
});

describe("filterRows", () => {
  const rows = [
    row({ employeeId: "E001", personName: "王小明", categoryId: "cat-ot", categoryName: "加班" }),
    row({ employeeId: "E002", personName: "李小華", categoryId: "cat-leave", categoryName: "請假" }),
    row({ employeeId: "E003", personName: "王小明", categoryId: null, categoryName: null }),
  ];

  it("returns everything when no filters are set", () => {
    expect(filterRows(rows, "", "")).toHaveLength(3);
  });

  it("filters by exact person name", () => {
    const result = filterRows(rows, "王小明", "");
    expect(result.map((r) => r.employeeId)).toEqual(["E001", "E003"]);
  });

  it("filters by exact category id", () => {
    const result = filterRows(rows, "", "cat-leave");
    expect(result.map((r) => r.employeeId)).toEqual(["E002"]);
  });

  it("filters by the 未填 sentinel to match null categoryId", () => {
    const result = filterRows(rows, "", NO_CATEGORY);
    expect(result.map((r) => r.employeeId)).toEqual(["E003"]);
  });

  it("combines person and category filters (AND, not OR)", () => {
    const result = filterRows(rows, "王小明", NO_CATEGORY);
    expect(result.map((r) => r.employeeId)).toEqual(["E003"]);
  });

  it("returns nothing when the combination matches no row", () => {
    const result = filterRows(rows, "王小明", "cat-leave");
    expect(result).toEqual([]);
  });
});

describe("computeCategorySubtotals", () => {
  it("counts records per category label, using 未填 for null categories", () => {
    const rows = [
      row({ categoryId: "cat-ot", categoryName: "加班" }),
      row({ categoryId: "cat-ot", categoryName: "加班" }),
      row({ categoryId: null, categoryName: null }),
    ];
    expect(computeCategorySubtotals(rows)).toEqual([
      ["加班", 2],
      ["未填", 1],
    ]);
  });

  it("returns an empty list for no rows", () => {
    expect(computeCategorySubtotals([])).toEqual([]);
  });

  // AC-8: extended fields (實際產量/加班時數/配合度/3S表現/SOP表現) must not
  // introduce extra subtotal dimensions — grouping stays by categoryName only.
  it("groups only by categoryName, ignoring differing extended-field values (AC-8)", () => {
    const rows = [
      row({
        categoryId: "cat-ot",
        categoryName: "加班",
        actualQuantity: 10,
        overtimeHours: 3,
        complianceRatingName: "跨崗位",
        threeSPerformanceName: "正常",
        sopPerformanceName: "正常",
      }),
      row({
        categoryId: "cat-ot",
        categoryName: "加班",
        actualQuantity: null,
        overtimeHours: null,
        complianceRatingName: null,
        threeSPerformanceName: null,
        sopPerformanceName: null,
      }),
    ];
    expect(computeCategorySubtotals(rows)).toEqual([["加班", 2]]);
  });
});
