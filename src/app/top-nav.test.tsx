// @vitest-environment jsdom
// jsdom 元件測試（docs/2026-08-04-attendance-scoring-rules plan.md T-6/T-7）：
// 驗證「積分規則設定」連結僅在 developer 角色下出現在選單（AC-1/AC-11 的選單隱藏部分）。
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
  it("shows 積分規則設定 for a developer session (AC-1)", async () => {
    mockMe("developer");
    render(<TopNav />);
    expect(await screen.findByText("積分規則設定")).toBeInTheDocument();
  });

  it("does not show 積分規則設定 for a foreman session (AC-11)", async () => {
    mockMe("foreman");
    render(<TopNav />);
    await waitFor(() => expect(screen.getByText("類別管理")).toBeInTheDocument());
    expect(screen.queryByText("積分規則設定")).toBeNull();
  });
});
