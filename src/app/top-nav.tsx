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

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then(setMe)
      .finally(() => setChecked(true));
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (pathname === "/login") return null;
  if (!checked) return null;

  return (
    <nav className="topnav">
      <Link href="/">首頁</Link>
      <Link href="/persons">人員主檔</Link>
      <Link href="/categories">出勤類別</Link>
      <Link href="/forms">出勤表單（班長）</Link>
      {me?.role === "developer" && (
        <>
          <Link href="/forms?mode=supervisor">待審核（開發者）</Link>
          <Link href="/accounts">帳號管理</Link>
        </>
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
