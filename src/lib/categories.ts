import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// 出勤類別是固定於 scripts/seed.cjs 的設定資料，不開放透過畫面／API 新增
// （新增類別等同新增一條計分規則的詞彙，須經 code review，不應是隨手操作）。
export function listCategories(activeOnly = false) {
  return prisma.attendanceCategory.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { sortOrder: "asc" },
  });
}

export async function setCategoryActive(id: string, isActive: boolean) {
  const category = await prisma.attendanceCategory.findUnique({ where: { id } });
  if (!category) {
    throw new AppError(404, "找不到出勤類別");
  }
  return prisma.attendanceCategory.update({ where: { id }, data: { isActive } });
}
