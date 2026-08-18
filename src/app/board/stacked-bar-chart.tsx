import type { PersonScoreSummary } from "@/lib/score-query";
import { SCORE_CATEGORIES, scoreValueFor } from "./score-colors";

// docs/2026-08-14-employee-score-dashboard/spec.md FR-9/AC-11：跨人比較的分數
// 組成堆疊長條圖，只取排行榜前 TOP_N_FOR_CHART 名；資料直接取自呼叫端已取得、
// 已排序好的排行榜資料（不重新呼叫 API、不重新計算），顏色對應沿用 T-8 共用表，
// 跟 DonutChart 保持一致（同一項分數在兩張圖表上永遠同一個顏色）。
export const TOP_N_FOR_CHART = 8;

export default function StackedBarChart({ rows }: { rows: PersonScoreSummary[] }) {
  const top = rows.slice(0, TOP_N_FOR_CHART);
  const maxTotal = Math.max(
    1,
    ...top.map((p) => SCORE_CATEGORIES.reduce((sum, c) => sum + Math.max(0, scoreValueFor(p, c.key)), 0))
  );

  return (
    <div className="card" style={{ marginBottom: "20px" }}>
      <h2>分數組成（前 {top.length} 名）</h2>
      {top.map((p) => (
        <div key={p.employeeId} style={{ display: "grid", gridTemplateColumns: "80px 1fr 48px", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <span style={{ fontSize: "12px", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.personName}
          </span>
          <div style={{ display: "flex", height: "20px" }} data-testid="stacked-bar-track">
            {SCORE_CATEGORIES.map((c) => {
              const value = scoreValueFor(p, c.key);
              if (value <= 0) return null;
              const widthPct = (value / maxTotal) * 100;
              return (
                <div
                  key={c.key}
                  data-testid="stacked-bar-segment"
                  data-category={c.key}
                  data-value={value}
                  style={{ width: `calc(${widthPct}% - 2px)`, marginRight: "2px", background: c.color, height: "100%" }}
                  title={`${c.label} ${value}`}
                />
              );
            })}
          </div>
          <span style={{ fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{p.totalScore}</span>
        </div>
      ))}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #e1e0d9" }}>
        {SCORE_CATEGORIES.map((c) => (
          <span key={c.key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
            <span aria-hidden="true" style={{ width: "10px", height: "10px", borderRadius: "2px", background: c.color, display: "inline-block" }} />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
