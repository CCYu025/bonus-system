// @vitest-environment jsdom
// jsdom 沒有內建 matchMedia，用最小 mock 手法模擬（含 change 事件監聽），驗證
// hook 初始值與訂閱後的變化都正確反映（spec.md AC-13/AC-14 的判斷依據）。
import "../../../test/jsdom-setup";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import { useIsNarrowScreen } from "./use-is-narrow-screen";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockMatchMedia(initialMatches: boolean) {
  let listener: ((e: MediaQueryListEvent) => void) | null = null;
  const mql = {
    matches: initialMatches,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listener = cb;
    },
    removeEventListener: () => {
      listener = null;
    },
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql)
  );
  return {
    fireChange(matches: boolean) {
      mql.matches = matches;
      listener?.({ matches } as MediaQueryListEvent);
    },
  };
}

describe("useIsNarrowScreen", () => {
  it("returns true initially when matchMedia already matches (narrow)", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsNarrowScreen());
    expect(result.current).toBe(true);
  });

  it("returns false initially when matchMedia does not match (wide)", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsNarrowScreen());
    expect(result.current).toBe(false);
  });

  it("updates when the media query change event fires", () => {
    const { fireChange } = mockMatchMedia(false);
    const { result } = renderHook(() => useIsNarrowScreen());
    expect(result.current).toBe(false);

    act(() => {
      fireChange(true);
    });
    expect(result.current).toBe(true);
  });
});
