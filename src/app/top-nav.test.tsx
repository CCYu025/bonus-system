// @vitest-environment jsdom
// jsdom 元件測試：驗證「功能設定」單一入口在所有角色下都顯示（人員主檔/類別管理
// 對所有角色開放，故入口本身不做角色門檻），以及「待審核（開發者）」僅
// developer 角色可見。積分規則設定/帳號管理的角色鎖定行為改在
// src/app/settings/layout.test.tsx 驗證（已搬進側欄，不再是 top-nav 的節點）。
// 真正的安全邊界由 API 的 401/403 測試覆蓋（見 src/app/api/*/route.test.ts），
// 這裡只驗證選單這一層 UX 渲染邏輯。
import "../../test/jsdom-setup";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import TopNav from "./top-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockMe(role: "developer" | "foreman" | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      role === null
        ? { ok: false, json: async () => ({}) }
        : { ok: true, json: async () => ({ role, displayName: role }) }
    )
  );
}

describe("TopNav", () => {
  it("shows 功能設定 for a developer session", async () => {
    mockMe("developer");
    render(<TopNav />);
    expect(await screen.findByText("功能設定")).toBeInTheDocument();
  });

  it("shows 功能設定 for a foreman session too", async () => {
    mockMe("foreman");
    render(<TopNav />);
    expect(await screen.findByText("功能設定")).toBeInTheDocument();
  });

  it("shows 待審核（開發者） for a developer session", async () => {
    mockMe("developer");
    render(<TopNav />);
    expect(await screen.findByText("待審核（開發者）")).toBeInTheDocument();
  });

  it("does not show 待審核（開發者） for a foreman session", async () => {
    mockMe("foreman");
    render(<TopNav />);
    await waitFor(() => expect(screen.getByText("功能設定")).toBeInTheDocument());
    expect(screen.queryByText("待審核（開發者）")).toBeNull();
  });
});
