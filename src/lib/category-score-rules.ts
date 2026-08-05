import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// 假日加班的積分完全由 OvertimeScoreRule 的假日加班級距決定（AC-4）——這個類別
// 不透過 CategoryScoreRule 設定固定積分，見 docs/2026-08-04-attendance-scoring-rules/spec.md。
const HOLIDAY_OVERTIME_CODE = "HOLIDAY_OVERTIME";

export type CategoryScoreRuleItem = {
  categoryId: string;
  categoryName: string;
  points: number | null;
  updatedAt: Date | null;
  updatedBy: string | null;
  // "category"：積分由 CategoryScoreRule 設定；"overtime"：假日加班，積分固定
  // 由加班規則決定，points 恆為 null，前端不得為它渲染積分輸入欄位（AC-4）。
  scoreSource: "category" | "overtime";
};

// 出勤類別積分清單——列出目前啟用中的所有類別（含假日加班，AC-4 要求它仍以
// 一個列項出現，只是不提供積分輸入）；未有對應 CategoryScoreRule 資料列的
// 類別，points 回傳 null（「未設定」，AC-3），不得推導或顯示成 0。
export async function listCategoryScoreRules(): Promise<CategoryScoreRuleItem[]> {
  const categories = await prisma.attendanceCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: { categoryScoreRule: true },
  });

  return categories.map((c) => {
    const isHolidayOvertime = c.code === HOLIDAY_OVERTIME_CODE;
    return {
      categoryId: c.id,
      categoryName: c.name,
      points: isHolidayOvertime ? null : c.categoryScoreRule?.points ?? null,
      updatedAt: isHolidayOvertime ? null : c.categoryScoreRule?.updatedAt ?? null,
      updatedBy: isHolidayOvertime ? null : c.categoryScoreRule?.updatedBy ?? null,
      scoreSource: isHolidayOvertime ? "overtime" : "category",
    };
  });
}

// 每個類別最多一筆規則：首次設定＝建立，之後皆為更新，皆用同一個 upsert 語意
// （見 plan.md「技術決策記錄」第 2 項）。
export async function upsertCategoryScoreRule(
  categoryId: string,
  points: number,
  updatedBy: string
) {
  const category = await prisma.attendanceCategory.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw new AppError(404, "找不到出勤類別");
  }
  if (!category.isActive) {
    throw new AppError(400, "已停用的類別不可設定積分");
  }
  if (category.code === HOLIDAY_OVERTIME_CODE) {
    // AC-4 的資料層防線：假日加班不透過此表設定固定積分，即使繞過前端直接呼叫 API 也拒絕。
    throw new AppError(400, "假日加班的積分由加班規則決定，不可在此設定固定積分");
  }
  if (!Number.isInteger(points)) {
    throw new AppError(400, "積分須為整數");
  }

  return prisma.categoryScoreRule.upsert({
    where: { categoryId },
    create: { categoryId, points, updatedBy },
    update: { points, updatedBy },
  });
}
