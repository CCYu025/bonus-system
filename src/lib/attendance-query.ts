import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { isFilledRecord } from "@/lib/attendance-records";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export type AttendanceQueryRow = {
  date: string;
  employeeId: string;
  personName: string;
  categoryId: string | null;
  categoryName: string | null;
  note: string | null;
  actualQuantity: number | null;
  overtimeHours: number | null;
  complianceRatingName: string | null;
  threeSPerformanceName: string | null;
  sopPerformanceName: string | null;
};

// T-1: 依「年月」查詢當月現行有效版本的已核准出勤紀錄。
// status="approved" 且 activeDateKey 非 null，代表尚未被作廢重審取代的現行版本；
// 兩者同時滿足時，每個 date 至多一筆（activeDateKey 於 schema 為 @unique），
// 確保同一人同一天不會因作廢重審的歷史版本被重複計入（NFR-1 / AC-5 / AC-6）。
// 以 date 欄位（"YYYY-MM-DD"）做 startsWith 比對取代手動計算月初/月末，
// 天然避開月份天數（28/29/30/31）邊界問題，也讓查詢範圍固定不超過一個月（NFR-3）。
export async function queryAttendanceByMonth(month: string): Promise<AttendanceQueryRow[]> {
  if (!month || !MONTH_PATTERN.test(month)) {
    throw new AppError(400, "請提供正確的年月格式（YYYY-MM）");
  }

  const forms = await prisma.attendanceForm.findMany({
    where: {
      status: "approved",
      activeDateKey: { not: null },
      date: { startsWith: `${month}-` },
    },
    include: {
      records: {
        where: { voided: false },
        include: {
          person: true,
          category: true,
          complianceRating: true,
          threeSPerformance: true,
          sopPerformance: true,
        },
        orderBy: { person: { employeeId: "asc" } },
      },
    },
    orderBy: { date: "asc" },
  });

  // T-2 (spec 2026-07-31-attendance-exclude-unfilled)：未填（categoryId 為
  // null）的紀錄不出現在查詢結果，資料庫紀錄本身不受影響，僅此讀取層過濾。
  // employeeId/personName 皆透過 personId 關聯即時讀取 Person 目前的資料
  // （spec 2026-07-31-attendance-record-personid-migration FR-4），工號或
  // 姓名更正後，歷史查詢會一致反映最新值。
  return forms.flatMap((form) =>
    form.records.filter(isFilledRecord).map((r) => ({
      date: form.date,
      employeeId: r.person.employeeId,
      personName: r.person.name,
      categoryId: r.categoryId,
      categoryName: r.category?.name ?? null,
      note: r.note,
      actualQuantity: r.actualQuantity,
      overtimeHours: r.overtimeHours,
      complianceRatingName: r.complianceRating?.name ?? null,
      threeSPerformanceName: r.threeSPerformance?.name ?? null,
      sopPerformanceName: r.sopPerformance?.name ?? null,
    }))
  );
}
