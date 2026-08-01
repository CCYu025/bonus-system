import { prisma } from "@/lib/prisma";
import { AppError, isPrismaUniqueConstraintError } from "@/lib/errors";

// 3S表現清單——結構同 ComplianceRating，開放透過畫面／API 新增與編輯，
// 不含 score／weight 欄位（評分系統是另一個未來需求）。
export function listThreeSPerformances(activeOnly = false) {
  return prisma.threeSPerformance.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { sortOrder: "asc" },
  });
}

export async function createThreeSPerformance(input: {
  code: string;
  name: string;
  sortOrder?: number;
}) {
  if (!input.code?.trim() || !input.name?.trim()) {
    throw new AppError(400, "業務代碼與名稱為必填");
  }
  try {
    return await prisma.threeSPerformance.create({
      data: {
        code: input.code.trim(),
        name: input.name.trim(),
        sortOrder: input.sortOrder ?? 0,
      },
    });
  } catch (err) {
    if (isPrismaUniqueConstraintError(err)) {
      throw new AppError(409, `業務代碼 ${input.code} 已存在`);
    }
    throw err;
  }
}

export async function updateThreeSPerformance(
  id: string,
  input: { code?: string; name?: string; sortOrder?: number; isActive?: boolean }
) {
  const existing = await prisma.threeSPerformance.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, "找不到3S表現選項");
  }
  if (input.code !== undefined && !input.code.trim()) {
    throw new AppError(400, "業務代碼不可為空");
  }
  if (input.name !== undefined && !input.name.trim()) {
    throw new AppError(400, "名稱不可為空");
  }
  try {
    return await prisma.threeSPerformance.update({
      where: { id },
      data: {
        code: input.code?.trim(),
        name: input.name?.trim(),
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
    });
  } catch (err) {
    if (isPrismaUniqueConstraintError(err)) {
      throw new AppError(409, `業務代碼 ${input.code} 已存在`);
    }
    throw err;
  }
}
