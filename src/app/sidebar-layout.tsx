"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Me = { role: "developer" | "foreman"; displayName: string };

export type SidebarItem = {
  key: string;
  href: string;
  label: string;
  devOnly?: boolean;
};

// 極簡鎖頭圖示，跟隨文字顏色（currentColor），不額外引入圖示套件。
function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      style={{ marginLeft: 4, verticalAlign: "-1px" }}
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

// 「功能設定」／「查詢」共用的側欄骨架：側欄貼齊視窗最左側（見 .sidebar-shell），
// 不受右側內容欄寬度影響水平位置；devOnly 項目在角色未確認/非開發者時顯示但鎖定
// （灰階＋鎖頭，非連結、點了沒反應），不做成整組隱藏。
export default function SidebarLayout({
  title,
  items,
  children,
}: {
  title: string;
  items: SidebarItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then(setMe)
      .finally(() => setChecked(true));
  }, []);

  // 未確認角色前，devOnly 項目先當成鎖定，避免班長帳號短暫看到可點擊狀態。
  const isDeveloper = checked && me?.role === "developer";

  return (
    <div className="sidebar-shell">
      <aside className="sidebar-nav">
        <h1 className="sidebar-title">{title}</h1>
        {items.map((item) => {
          const locked = item.devOnly && !isDeveloper;
          if (locked) {
            return (
              <span key={item.key} className="sidebar-nav-item locked" title="僅開發者可使用">
                {item.label}
                <LockIcon />
              </span>
            );
          }
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`sidebar-nav-item${pathname === item.href ? " active" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </aside>
      <div className="sidebar-content">
        <div className="container">{children}</div>
      </div>
    </div>
  );
}
