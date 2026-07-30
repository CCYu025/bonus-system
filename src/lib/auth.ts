import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { UserRole } from "@/generated/prisma/client";

export const SESSION_COOKIE = "sid";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // NFR-1: 8 小時，不做記住我

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await prisma.session.create({ data: { userId, expiresAt } });

  const store = await cookies();
  store.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });

  return session;
}

export async function destroyCurrentSession() {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (sid) {
    await prisma.session.deleteMany({ where: { id: sid } });
  }
  store.delete(SESSION_COOKIE);
}

// AC-3 / AC-8: reads the live isActive flag on every call rather than trusting
// the session token alone, so a deactivated account is rejected immediately.
export async function getCurrentSession() {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return null;

  const session = await prisma.session.findUnique({
    where: { id: sid },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date() || !session.user.isActive) return null;

  return session;
}

export async function requireAuth() {
  const session = await getCurrentSession();
  if (!session) throw new AppError(401, "請先登入");
  return session;
}

export async function requireRole(role: UserRole) {
  const session = await requireAuth();
  if (session.user.role !== role) throw new AppError(403, "權限不足");
  return session;
}
