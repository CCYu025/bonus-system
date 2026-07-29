import { prisma } from "@/lib/prisma";
import { AppError, isPrismaUniqueConstraintError } from "@/lib/errors";

export function listPersons() {
  return prisma.person.findMany({ orderBy: { employeeId: "asc" } });
}

export async function createPerson(employeeId: string, name: string) {
  if (!employeeId.trim() || !name.trim()) {
    throw new AppError(400, "工號與姓名為必填");
  }
  try {
    return await prisma.person.create({
      data: { employeeId: employeeId.trim(), name: name.trim() },
    });
  } catch (err) {
    if (isPrismaUniqueConstraintError(err)) {
      throw new AppError(409, `工號 ${employeeId} 已存在`);
    }
    throw err;
  }
}

// Soft delete only (AC-2): flips status to terminated, row and history stay intact.
export async function softDeletePerson(employeeId: string) {
  const person = await prisma.person.findUnique({ where: { employeeId } });
  if (!person) {
    throw new AppError(404, `找不到工號 ${employeeId}`);
  }
  return prisma.person.update({
    where: { employeeId },
    data: { status: "terminated" },
  });
}
