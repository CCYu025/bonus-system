import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export type SopPerformanceScoreRuleItem = {
  sopPerformanceId: string;
  name: string;
  points: number | null;
  isActive: boolean;
  isLocked: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
};

// SOP表現積分清單，結構與 listThreeSPerformanceScoreRules 完全對稱。
export async function listSopPerformanceScoreRules(): Promise<SopPerformanceScoreRuleItem[]> {
  const performances = await prisma.sopPerformance.findMany({
    orderBy: { sortOrder: "asc" },
    include: { sopPerformanceScoreRule: true },
  });

  return performances.map((p) => ({
    sopPerformanceId: p.id,
    name: p.name,
    points: p.sopPerformanceScoreRule?.points ?? null,
    isActive: p.isActive,
    isLocked: p.isLocked,
    updatedAt: p.sopPerformanceScoreRule?.updatedAt ?? null,
    updatedBy: p.sopPerformanceScoreRule?.updatedBy ?? null,
  }));
}

// guard 順序與 upsertThreeSPerformanceScoreRule 完全對稱。
export async function upsertSopPerformanceScoreRule(
  sopPerformanceId: string,
  points: number,
  updatedBy: string
) {
  const performance = await prisma.sopPerformance.findUnique({ where: { id: sopPerformanceId } });
  if (!performance) {
    throw new AppError(404, "找不到SOP表現項目");
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

  return prisma.sopPerformanceScoreRule.upsert({
    where: { sopPerformanceId },
    create: { sopPerformanceId, points, updatedBy },
    update: { points, updatedBy },
  });
}
