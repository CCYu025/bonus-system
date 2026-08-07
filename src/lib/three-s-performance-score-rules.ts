import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export type ThreeSPerformanceScoreRuleItem = {
  threeSPerformanceId: string;
  name: string;
  points: number | null;
  isActive: boolean;
  isLocked: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
};

// 3S表現積分清單——列出所有項目（含已停用，AC-7 要求停用項目仍要出現，只是
// 唯讀）；isLocked 一併回傳，供前端判斷「正常」不顯示積分輸入欄位（AC-2）。
// 未有對應規則列的項目，points 回傳 null（「未設定」），不得推導或顯示成 0。
export async function listThreeSPerformanceScoreRules(): Promise<
  ThreeSPerformanceScoreRuleItem[]
> {
  const performances = await prisma.threeSPerformance.findMany({
    orderBy: { sortOrder: "asc" },
    include: { threeSPerformanceScoreRule: true },
  });

  return performances.map((p) => ({
    threeSPerformanceId: p.id,
    name: p.name,
    points: p.threeSPerformanceScoreRule?.points ?? null,
    isActive: p.isActive,
    isLocked: p.isLocked,
    updatedAt: p.threeSPerformanceScoreRule?.updatedAt ?? null,
    updatedBy: p.threeSPerformanceScoreRule?.updatedBy ?? null,
  }));
}

// 每個項目最多一筆規則，upsert 語意比照 upsertComplianceRatingScoreRule。
// 鎖定項目（「正常」）在找到之後、判斷停用之前先擋（AC-4）——鎖定是比停用更
// 根本的「不可設定」狀態，即使有一天鎖定項目本身被判定為 isActive: false 也一樣拒絕。
export async function upsertThreeSPerformanceScoreRule(
  threeSPerformanceId: string,
  points: number,
  updatedBy: string
) {
  const performance = await prisma.threeSPerformance.findUnique({
    where: { id: threeSPerformanceId },
  });
  if (!performance) {
    throw new AppError(404, "找不到3S表現項目");
  }
  if (performance.isLocked) {
    throw new AppError(400, "「正常」為系統鎖定選項，不可設定積分");
  }
  if (!performance.isActive) {
    throw new AppError(400, "已停用的項目不可設定積分");
  }
  if (!Number.isInteger(points)) {
    throw new AppError(400, "積分須為整數");
  }

  return prisma.threeSPerformanceScoreRule.upsert({
    where: { threeSPerformanceId },
    create: { threeSPerformanceId, points, updatedBy },
    update: { points, updatedBy },
  });
}
