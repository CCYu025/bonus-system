"use client";

import { useEffect, useRef } from "react";
import type { PersonScoreSummary } from "@/lib/score-query";
import DonutChart from "./donut-chart";
import DetailTable from "./detail-table";

type Props = {
  summary: PersonScoreSummary;
  rank: number;
  total: number;
  isNarrow: boolean;
  onClose: () => void;
};

// docs/2026-08-14-employee-score-dashboard/spec.md AC-4/AC-13/AC-14/AC-15：
// 寬螢幕置中對話框、窄螢幕底部操作表共用同一套焦點管理邏輯（NFR-4）——用
// role="dialog" 自建而非原生 <dialog>，兩種呈現只有 CSS/開關方式不同，焦點
// trap／Esc／關閉後還焦點三件事的實作完全一致，也更容易在 jsdom 測試。
export default function PersonModal({ summary, rank, total, isNarrow, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    triggerElRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      triggerElRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const container = containerRef.current;
        if (!container) return;
        const focusables = container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  // 下滑手勢關閉（僅 bottom sheet，AC-13）：touchstart 記錄起點 Y，touchend
  // 累積垂直位移超過閾值視為關閉意圖。
  const touchStartY = useRef<number | null>(null);
  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    touchStartY.current = e.touches[0].clientY;
  }
  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (touchStartY.current === null) return;
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    if (delta > 80) onClose();
  }

  const titleId = "person-modal-title";

  return (
    <div
      className="board-modal-backdrop"
      data-testid="board-modal-backdrop"
      onClick={handleBackdropClick}
      onTouchStart={isNarrow ? handleTouchStart : undefined}
      onTouchEnd={isNarrow ? handleTouchEnd : undefined}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={isNarrow ? "board-sheet" : "board-dialog"}
      >
        {isNarrow && <div className="board-sheet-handle" aria-hidden="true" />}
        <div className="board-modal-head">
          <div>
            <div id={titleId} className="board-modal-title">
              {summary.personName}
            </div>
            <p className="hint">
              工號 {summary.employeeId} · 第 {rank} 名 / 共 {total} 人
            </p>
          </div>
          <button ref={closeButtonRef} onClick={onClose} aria-label="關閉" className="board-modal-close">
            ✕
          </button>
        </div>
        <div className="board-modal-body">
          <DonutChart summary={summary} />
          <DetailTable records={summary.records} />
        </div>
      </div>
    </div>
  );
}
