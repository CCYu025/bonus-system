import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { AppError, isPrismaUniqueConstraintError } from "@/lib/errors";
import type { UserRole } from "@/generated/prisma/client";

const ACCOUNT_SELECT = {
  id: true,
  username: true,
  role: true,
  displayName: true,
  isActive: true,
  createdAt: true,
} as const;

export function listAccounts() {
  return prisma.user.findMany({
    select: ACCOUNT_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

// AC-1 / AC-2: returns the user only on a valid, active-account match; callers
// must not reveal to the client whether the username or the password was wrong.
export async function authenticateUser(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.isActive) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return user;
}

// AC-7 / FR-3
export async function createAccount(params: {
  username: string;
  password: string;
  role: UserRole;
  displayName: string;
}) {
  const { username, password, role, displayName } = params;
  if (!username?.trim() || !password || !displayName?.trim()) {
    throw new AppError(400, "帳號、密碼與顯示姓名為必填");
  }
  if (role !== "developer" && role !== "foreman") {
    throw new AppError(400, "角色必須為 developer 或 foreman");
  }

  const passwordHash = await hashPassword(password);
  try {
    return await prisma.user.create({
      data: {
        username: username.trim(),
        passwordHash,
        role,
        displayName: displayName.trim(),
      },
      select: ACCOUNT_SELECT,
    });
  } catch (err) {
    if (isPrismaUniqueConstraintError(err)) {
      throw new AppError(409, `帳號 ${username} 已存在`);
    }
    throw err;
  }
}

// AC-8: deactivating must also cut off any of the account's existing sessions.
export async function setAccountActive(id: string, isActive: boolean) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, "找不到帳號");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: { isActive },
      select: ACCOUNT_SELECT,
    });
    if (!isActive) {
      await tx.session.deleteMany({ where: { userId: id } });
    }
    return updated;
  });
}

// AC-13: only changes the account's current displayName; past audit log rows
// already hold their own snapshot and are untouched.
export async function updateDisplayName(id: string, displayName: string) {
  if (!displayName?.trim()) {
    throw new AppError(400, "顯示姓名為必填");
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, "找不到帳號");

  return prisma.user.update({
    where: { id },
    data: { displayName: displayName.trim() },
    select: ACCOUNT_SELECT,
  });
}
