import SidebarLayout, { type SidebarItem } from "../sidebar-layout";

const NAV_ITEMS: SidebarItem[] = [
  { key: "persons", href: "/settings/persons", label: "人員主檔", devOnly: false },
  { key: "categories", href: "/settings/categories", label: "類別管理", devOnly: false },
  { key: "score-rules", href: "/settings/score-rules", label: "積分規則設定", devOnly: true },
  { key: "accounts", href: "/settings/accounts", label: "帳號管理", devOnly: true },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout title="功能設定" items={NAV_ITEMS}>
      {children}
    </SidebarLayout>
  );
}
