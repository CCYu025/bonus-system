import { prisma } from "@/lib/prisma";
import { AppError, isPrismaUniqueConstraintError } from "@/lib/errors";

export function listCategories(activeOnly = false) {
  return prisma.attendanceCategory.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { sortOrder: "asc" },
  });
}

export async function createCategory(params: {
  code: string;
  name: string;
  sortOrder?: number;
}) {
  if (!params.code.trim() || !params.name.trim()) {
    throw new AppError(400, "業務代碼與名稱為必填");
  }
  try {
    return await prisma.attendanceCategory.create({
      data: {
        code: params.code.trim(),
        name: params.name.trim(),
        sortOrder: params.sortOrder ?? 0,
      },
    });
  } catch (err) {
    if (isPrismaUniqueConstraintError(err)) {
      throw new AppError(409, `業務代碼 ${params.code} 已存在`);
    }
    throw err;
  }
}

export async function setCategoryActive(id: string, isActive: boolean) {
  const category = await prisma.attendanceCategory.findUnique({ where: { id } });
  if (!category) {
    throw new AppError(404, "找不到出勤類別");
  }
  return prisma.attendanceCategory.update({ where: { id }, data: { isActive } });
}
