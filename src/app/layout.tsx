import type { Metadata } from "next";
import "./globals.css";
import TopNav from "./top-nav";

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
        <TopNav />
        {children}
      </body>
    </html>
  );
}
