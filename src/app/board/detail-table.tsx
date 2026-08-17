"use client";

import { useRef, useState } from "react";
import type { ScoreRecordDetail } from "@/lib/score-query";

// docs/2026-08-14-employee-score-dashboard/spec.md AC-10：彈窗整體高度固定，
// 每日明細表格區域自身可獨立捲動；表頭 sticky 固定在該區域頂部；區域底部尚有
// 未捲動到的內容時顯示淡出漸層陰影提示，捲到底部時陰影消失。sticky 定位與真實
// 捲動行為在 jsdom 沒有實際版面尺寸，這裡的邏輯本身另有 Playwright 測試覆蓋
// （plan.md T-10）；此檔案本身只負責標記與捲動事件邏輯。
export default function DetailTable({ records }: { records: ScoreRecordDetail[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(true);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    setShowFade(!atBottom);
  }

  return (
    <div style={{ position: "relative", marginTop: "16px" }}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="detail-scroll-area"
        style={{ maxHeight: "220px", overflowY: "auto" }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", top: 0, background: "#fcfcfb", textAlign: "left", padding: "6px 8px" }}>
                日期
              </th>
              <th style={{ position: "sticky", top: 0, background: "#fcfcfb", textAlign: "left", padding: "6px 8px" }}>
                出勤類別
              </th>
              <th style={{ position: "sticky", top: 0, background: "#fcfcfb", textAlign: "right", padding: "6px 8px" }}>
                類別分
              </th>
              <th style={{ position: "sticky", top: 0, background: "#fcfcfb", textAlign: "right", padding: "6px 8px" }}>
                加班分
              </th>
              <th style={{ position: "sticky", top: 0, background: "#fcfcfb", textAlign: "right", padding: "6px 8px" }}>
                配合度分
              </th>
              <th style={{ position: "sticky", top: 0, background: "#fcfcfb", textAlign: "right", padding: "6px 8px" }}>
                3S分
              </th>
              <th style={{ position: "sticky", top: 0, background: "#fcfcfb", textAlign: "right", padding: "6px 8px" }}>
                SOP分
              </th>
              <th style={{ position: "sticky", top: 0, background: "#fcfcfb", textAlign: "right", padding: "6px 8px" }}>
                當日小計
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.date}>
                <td style={{ padding: "6px 8px" }}>{r.date}</td>
                <td style={{ padding: "6px 8px" }}>{r.categoryName ?? "未填"}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.categoryPoints}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.overtimePoints}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.complianceRatingPoints}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.threeSPerformancePoints}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.sopPerformancePoints}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.subtotal}</td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: "6px 8px" }}>
                  本月無出勤紀錄
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div
        data-testid="detail-scroll-fade"
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "24px",
          background: "linear-gradient(to bottom, transparent, #fcfcfb)",
          pointerEvents: "none",
          opacity: showFade ? 1 : 0,
        }}
      />
    </div>
  );
}
