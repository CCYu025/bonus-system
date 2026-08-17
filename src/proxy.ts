import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Kept in sync with SESSION_COOKIE in lib/auth.ts. Not imported directly so
// Proxy doesn't have to bundle the Prisma client just for a cookie name.
const SESSION_COOKIE = "sid";

// AC-3: optimistic redirect for page requests with no session cookie at all.
// This only checks cookie presence (not DB isActive/expiry) per Next.js
// guidance to keep Proxy fast; the real, authoritative check lives in
// lib/auth.ts's requireAuth/requireRole, called by every protected API route.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

// docs/2026-08-14-employee-score-dashboard/spec.md FR-1：/board 是刻意免登入的
// 公開頁面，排除在導轉之外；首頁（/）與其餘既有頁面的 matcher 規則維持不變。
export const config = {
  matcher: ["/((?!api|login|board|_next/static|_next/image|favicon.ico).*)"],
};
