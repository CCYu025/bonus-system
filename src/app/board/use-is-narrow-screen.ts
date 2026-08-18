"use client";

import { useEffect, useState } from "react";

const NARROW_QUERY = "(max-width: 768px)";

// docs/2026-08-14-employee-score-dashboard/spec.md FR-11：768px 為窄/寬螢幕的
// 分界（plan.md 技術決策記錄第 5 項）。刻意用 JS 狀態（matchMedia）驅動兩套
// markup 切換，而非純 CSS media query，讓 AC-13/AC-14 能在 jsdom 用 mock
// matchMedia 直接做 component test，不需要另外建立 Playwright 環境。
export function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(NARROW_QUERY).matches : false
  );

  useEffect(() => {
    // 掛載時的初始值已由上面 useState 的 lazy initializer 算好，這裡只需要
    // 訂閱後續變化（不在 effect body 直接同步呼叫 setState）。
    const mql = window.matchMedia(NARROW_QUERY);
    function handleChange(e: MediaQueryListEvent) {
      setIsNarrow(e.matches);
    }
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return isNarrow;
}
