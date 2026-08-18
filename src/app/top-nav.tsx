"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

type Me = { role: "developer" | "foreman"; displayName: string };

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  // docs/2026-08-14-employee-score-dashboard/spec.md：/board 是免登入的公開頁面，
  // 訪客點內部導覽連結也只會被彈回 /login，顯示這些連結沒有意義；連帶省下對
  // /api/auth/me 的無意義呼叫（plan.md T-3 技術決策）。
  useEffect(() => {
    async function checkAuth() {
      if (pathname === "/board") {
        setChecked(true);
        return;
      }
      const res = await fetch("/api/auth/me");
      setMe(res.ok ? await res.json() : null);
      setChecked(true);
    }
    checkAuth();
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (pathname === "/login" || pathname === "/board") return null;
  if (!checked) return null;

  return (
    <nav className="topnav">
      <Link href="/">首頁</Link>
      <Link href="/forms">出勤表單（班長）</Link>
      <Link href="/query">查詢</Link>
      <Link href="/settings">功能設定</Link>
      {me?.role === "developer" && (
        <Link href="/forms?mode=supervisor">待審核（開發者）</Link>
      )}
      {me && (
        <span className="hint">
          {me.displayName}（{me.role === "developer" ? "開發者" : "班長"}） ·{" "}
          <button onClick={handleLogout}>登出</button>
        </span>
      )}
    </nav>
  );
}
