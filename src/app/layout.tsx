import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "出勤登記系統",
  description: "人員每日出勤資料輸入介面",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>
        <nav className="topnav">
          <Link href="/">首頁</Link>
          <Link href="/persons">人員主檔</Link>
          <Link href="/categories">出勤類別</Link>
          <Link href="/forms">出勤表單（班長）</Link>
          <Link href="/forms?mode=supervisor">待審核（課長）</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
