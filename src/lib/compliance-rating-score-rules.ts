import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export type ComplianceRatingScoreRuleItem = {
  complianceRatingId: string;
  name: string;
  points: number | null;
  isActive: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
};

// 配合度積分清單——列出所有配合度項目（含已停用，AC-7 要求停用項目仍要出現，
// 只是唯讀）；未有對應規則列的項目，points 回傳 null（「未設定」，AC-1），
// 不得推導或顯示成 0。
export async function listComplianceRatingScoreRules(): Promise<ComplianceRatingScoreRuleItem[]> {
  const ratings = await prisma.complianceRating.findMany({
    orderBy: { sortOrder: "asc" },
    include: { complianceRatingScoreRule: true },
  });

  return ratings.map((r) => ({
    complianceRatingId: r.id,
    name: r.name,
    points: r.complianceRatingScoreRule?.points ?? null,
    isActive: r.isActive,
    updatedAt: r.complianceRatingScoreRule?.updatedAt ?? null,
    updatedBy: r.complianceRatingScoreRule?.updatedBy ?? null,
  }));
}

// 每個配合度項目最多一筆規則：首次設定＝建立，之後皆為更新，皆用同一個 upsert
// 語意（比照 upsertCategoryScoreRule）。
export async function upsertComplianceRatingScoreRule(
  complianceRatingId: string,
  points: number,
  updatedBy: string
) {
  const rating = await prisma.complianceRating.findUnique({ where: { id: complianceRatingId } });
  if (!rating) {
    throw new AppError(404, "找不到配合度項目");
  }
  if (!rating.isActive) {
    throw new AppError(400, "已停用的項目不可設定積分");
  }
  if (!Number.isInteger(points)) {
    throw new AppError(400, "積分須為整數");
  }

  return prisma.complianceRatingScoreRule.upsert({
    where: { complianceRatingId },
    create: { complianceRatingId, points, updatedBy },
    update: { points, updatedBy },
  });
}
