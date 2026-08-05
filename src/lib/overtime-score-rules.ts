import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// 平日/假日兩組互斥時數級距，結構固定由 scripts/seed.cjs 依 spec FR-7 建立。
// 本次只開放編輯既有規則的 points/pointsPerExtraHour，不開放新增/刪除級距列
// （見 plan.md「技術決策記錄」第 2 項）——這裡刻意不提供 create/delete。
export async function listOvertimeScoreRules() {
  const [weekday, holiday] = await Promise.all([
    prisma.overtimeScoreRule.findMany({
      where: { overtimeType: "weekday" },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.overtimeScoreRule.findMany({
      where: { overtimeType: "holiday" },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  return [...weekday, ...holiday];
}

export async function updateOvertimeScoreRule(
  id: string,
  input: { points: number; pointsPerExtraHour?: number | null },
  updatedBy: string
) {
  const existing = await prisma.overtimeScoreRule.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, "找不到加班積分規則");
  }
  if (!Number.isInteger(input.points)) {
    throw new AppError(400, "積分須為整數");
  }
  if (
    input.pointsPerExtraHour !== undefined &&
    input.pointsPerExtraHour !== null &&
    !Number.isInteger(input.pointsPerExtraHour)
  ) {
    throw new AppError(400, "每小時遞增積分須為整數");
  }

  return prisma.overtimeScoreRule.update({
    where: { id },
    data: {
      points: input.points,
      pointsPerExtraHour:
        input.pointsPerExtraHour === undefined ? existing.pointsPerExtraHour : input.pointsPerExtraHour,
      updatedBy,
    },
  });
}
