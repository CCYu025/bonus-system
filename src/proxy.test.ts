// docs/2026-08-14-employee-score-dashboard/spec.md AC-1：/board 免登入可存取，
// 不會被導向 /login；其餘既有頁面（含首頁 /）維持原本的登入導轉行為不變。
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "./proxy";

function matcherRegex() {
  // config.matcher 是 Next.js 專用的路徑模式字串，語意上等同一個匿名的
  // negative-lookahead regex；這裡直接用它建構 RegExp 驗證行為，不重新
  // 手刻一套判斷邏輯。
  return new RegExp(`^${config.matcher[0]}$`);
}

describe("proxy.ts matcher", () => {
  it("does not match /board (AC-1)", () => {
    expect(matcherRegex().test("/board")).toBe(false);
  });

  it("still matches existing protected paths", () => {
    expect(matcherRegex().test("/")).toBe(true);
    expect(matcherRegex().test("/forms")).toBe(true);
    expect(matcherRegex().test("/settings/persons")).toBe(true);
    expect(matcherRegex().test("/query/score")).toBe(true);
  });

  it("still excludes api/login/static as before", () => {
    expect(matcherRegex().test("/api/auth/me")).toBe(false);
    expect(matcherRegex().test("/login")).toBe(false);
  });
});

// proxy() 本身不檢查路徑——它只判斷 cookie 存在與否；「/board 不被導向 /login」
// 這件事完全是靠 config.matcher 讓 Next.js 根本不對 /board 呼叫 proxy()，已由
// 上面的 matcher 測試涵蓋。這裡只回歸測試 proxy() 對「有呼叫到」的路徑行為不變。
describe("proxy() function (called on a matched path)", () => {
  it("still redirects to /login when there is no session cookie", () => {
    const req = new NextRequest("http://localhost/forms");
    const res = proxy(req);
    expect(res.headers.get("location")).toContain("/login");
  });
});
