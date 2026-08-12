import SidebarLayout, { type SidebarItem } from "../sidebar-layout";

const NAV_ITEMS: SidebarItem[] = [
  { key: "attendance", href: "/query/attendance", label: "出勤查詢" },
  { key: "score", href: "/query/score", label: "分數查詢" },
];

export default function QueryLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout title="查詢" items={NAV_ITEMS}>
      {children}
    </SidebarLayout>
  );
}
