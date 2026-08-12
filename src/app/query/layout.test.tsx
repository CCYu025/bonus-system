// @vitest-environment jsdom
// jsdom 元件測試：驗證「查詢」側欄的兩個子分頁連結都會渲染（出勤查詢/分數查詢
// 對所有角色開放，不像 settings 側欄有 devOnly 鎖定分支，測試相對單純）。
import "../../../test/jsdom-setup";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import QueryLayout from "./layout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/query/attendance",
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockMe(role: "developer" | "foreman") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ role, displayName: role }) }))
  );
}

describe("QueryLayout sidebar", () => {
  it("shows 出勤查詢/分數查詢 as clickable links for a foreman session", async () => {
    mockMe("foreman");
    render(<QueryLayout>content</QueryLayout>);
    expect(await screen.findByRole("link", { name: "出勤查詢" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "分數查詢" })).toBeInTheDocument();
  });
});
