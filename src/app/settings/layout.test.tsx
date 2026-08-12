// @vitest-environment jsdom
// jsdom 元件測試：驗證「功能設定」側欄的角色鎖定行為——人員主檔/類別管理對所有
// 角色開放；積分規則設定/帳號管理在班長角色下顯示但鎖定（灰階＋鎖頭、非連結，
// 點了沒反應），開發者角色下為可點擊連結。真正的安全邊界由 API 的 401/403
// 測試覆蓋，這裡只驗證側欄這一層 UX 渲染邏輯。
import "../../../test/jsdom-setup";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SettingsLayout from "./layout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/persons",
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

describe("SettingsLayout sidebar", () => {
  it("shows 人員主檔/類別管理 as clickable links for a foreman session", async () => {
    mockMe("foreman");
    render(<SettingsLayout>content</SettingsLayout>);
    expect(await screen.findByRole("link", { name: "人員主檔" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "類別管理" })).toBeInTheDocument();
  });

  it("shows 積分規則設定/帳號管理 as locked (not a link) for a foreman session", async () => {
    mockMe("foreman");
    render(<SettingsLayout>content</SettingsLayout>);
    await screen.findByRole("link", { name: "人員主檔" });
    expect(screen.getByText("積分規則設定")).toBeInTheDocument();
    expect(screen.getByText("帳號管理")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "積分規則設定" })).toBeNull();
    expect(screen.queryByRole("link", { name: "帳號管理" })).toBeNull();
  });

  it("shows all four items as clickable links for a developer session", async () => {
    mockMe("developer");
    render(<SettingsLayout>content</SettingsLayout>);
    expect(await screen.findByRole("link", { name: "積分規則設定" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "帳號管理" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "人員主檔" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "類別管理" })).toBeInTheDocument();
  });
});
