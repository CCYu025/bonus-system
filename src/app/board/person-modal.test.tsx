// @vitest-environment jsdom
// jsdom 元件測試：驗證 spec.md AC-4/AC-13/AC-14/AC-15——彈窗開啟時焦點移入、
// Tab 循環侷限在彈窗內、Esc/背景點擊/關閉鈕三種方式皆可關閉、關閉後焦點回到
// 觸發列；窄螢幕額外驗證下滑手勢關閉。
import "../../../test/jsdom-setup";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PersonModal from "./person-modal";
import type { PersonScoreSummary } from "@/lib/score-query";

afterEach(() => {
  cleanup();
});

function makeSummary(): PersonScoreSummary {
  return {
    employeeId: "000051",
    personName: "陳玉葉",
    categoryScore: 100,
    overtimeScore: 0,
    complianceScore: 0,
    threeSScore: 0,
    sopScore: 0,
    totalScore: 100,
    records: [],
  };
}

function renderWithTrigger(props: Partial<Parameters<typeof PersonModal>[0]> = {}) {
  const onClose = vi.fn();
  render(
    <div>
      <button data-testid="trigger-row">觸發列</button>
      <PersonModal summary={makeSummary()} rank={1} total={5} isNarrow={false} onClose={onClose} {...props} />
    </div>
  );
  return { onClose };
}

describe("PersonModal", () => {
  it("renders name, employeeId and rank (AC-4)", () => {
    renderWithTrigger();
    expect(screen.getByText("陳玉葉")).toBeInTheDocument();
    expect(screen.getByText(/000051/)).toBeInTheDocument();
    expect(screen.getByText(/第 1 名 \/ 共 5 人/)).toBeInTheDocument();
  });

  it("moves focus into the dialog on open (AC-15)", () => {
    renderWithTrigger();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("closes on Escape (AC-4/AC-15)", async () => {
    const { onClose } = renderWithTrigger();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when clicking the backdrop but not when clicking inside the dialog (AC-4)", () => {
    const { onClose } = renderWithTrigger();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("board-modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via the close button (AC-4)", async () => {
    const { onClose } = renderWithTrigger();
    await userEvent.click(screen.getByRole("button", { name: "關閉" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab focus cycling within the dialog (AC-15)", async () => {
    renderWithTrigger();
    const dialog = screen.getByRole("dialog");
    const closeBtn = screen.getByRole("button", { name: "關閉" });
    expect(document.activeElement).toBe(closeBtn);

    // Tab from the last focusable element should wrap back to the first,
    // never landing on the trigger button outside the dialog.
    for (let i = 0; i < 5; i++) {
      await userEvent.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("returns focus to the triggering element when unmounted (AC-15)", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "trigger";
    document.body.appendChild(trigger);
    trigger.focus();

    const onClose = vi.fn();
    const { unmount } = render(
      <PersonModal summary={makeSummary()} rank={1} total={5} isNarrow={false} onClose={onClose} />
    );
    expect(document.activeElement).not.toBe(trigger);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("renders as a bottom sheet with a drag handle on narrow screens (AC-13)", () => {
    renderWithTrigger({ isNarrow: true });
    expect(document.querySelector(".board-sheet")).not.toBeNull();
    expect(document.querySelector(".board-sheet-handle")).not.toBeNull();
  });

  it("renders as a centered dialog with no drag handle on wide screens (AC-14)", () => {
    renderWithTrigger({ isNarrow: false });
    expect(document.querySelector(".board-dialog")).not.toBeNull();
    expect(document.querySelector(".board-sheet-handle")).toBeNull();
  });

  it("closes on a downward swipe gesture when narrow (AC-13)", () => {
    const { onClose } = renderWithTrigger({ isNarrow: true });
    const backdrop = screen.getByTestId("board-modal-backdrop");
    fireEvent.touchStart(backdrop, { touches: [{ clientY: 100 }] });
    fireEvent.touchEnd(backdrop, { changedTouches: [{ clientY: 220 }] });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on a small/upward touch movement when narrow (AC-13)", () => {
    const { onClose } = renderWithTrigger({ isNarrow: true });
    const backdrop = screen.getByTestId("board-modal-backdrop");
    fireEvent.touchStart(backdrop, { touches: [{ clientY: 100 }] });
    fireEvent.touchEnd(backdrop, { changedTouches: [{ clientY: 110 }] });
    expect(onClose).not.toHaveBeenCalled();
  });
});
