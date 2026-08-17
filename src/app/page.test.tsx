// @vitest-environment jsdom
// jsdom 元件測試：驗證 spec.md AC-8——首頁有一個連結指向公開排行榜頁面
// （/board）。首頁本身仍在登入牆後面這件事由 src/proxy.test.ts 的 matcher
// 測試涵蓋，這裡不重複驗證。
import "../../test/jsdom-setup";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Home", () => {
  it("renders a link to /board (AC-8)", () => {
    render(<Home />);
    const link = screen.getByRole("link", { name: /員工分數查詢/ });
    expect(link).toHaveAttribute("href", "/board");
  });
});
