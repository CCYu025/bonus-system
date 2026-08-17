import type { PersonScoreSummary } from "@/lib/score-query";
import { SCORE_CATEGORIES, scoreValueFor } from "./score-colors";

const RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// docs/2026-08-14-employee-score-dashboard/spec.md AC-9：環狀圖只用「數值為正」
// 的項目計算佔比（圓餅圖天生畫不出負的角度），總分置中顯示的是含負值影響後的
// 真實總和；圖例則無條件列出全部五項（含 0 或負數），負值額外標示，不因為
// 畫不進環狀圖就從圖例省略。
export default function DonutChart({ summary }: { summary: PersonScoreSummary }) {
  const positiveTotal = SCORE_CATEGORIES.reduce((sum, c) => {
    const v = scoreValueFor(summary, c.key);
    return v > 0 ? sum + v : sum;
  }, 0);

  // 純函式方式計算每段的弧長與起始位移，不在 render 過程中重新賦值任何外部
  // 變數（避免 mutate-in-render）：先算出每個正值項目各自的弧長陣列，再用
  // 每個項目「前面所有項目弧長的和」推算自己的起始位移。
  const positiveEntries = SCORE_CATEGORIES.filter((c) => scoreValueFor(summary, c.key) > 0);
  const dashes = positiveEntries.map((c) =>
    positiveTotal > 0 ? (scoreValueFor(summary, c.key) / positiveTotal) * CIRCUMFERENCE : 0
  );
  const segments = positiveEntries.map((c, i) => {
    const dash = dashes[i];
    const offsetSoFar = dashes.slice(0, i).reduce((a, b) => a + b, 0);
    return {
      key: c.key,
      color: c.color,
      dasharray: `${dash} ${CIRCUMFERENCE - dash}`,
      dashoffset: -offsetSoFar,
    };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
      <svg
        width="132"
        height="132"
        viewBox="0 0 132 132"
        role="img"
        aria-label={`分數組成甜甜圈圖，總分 ${summary.totalScore}`}
      >
        <g transform="translate(66,66) rotate(-90)">
          <circle r={RADIUS} fill="none" stroke="#e1e0d9" strokeWidth="18" />
          {segments.map((s) => (
            <circle
              key={s.key}
              r={RADIUS}
              fill="none"
              stroke={s.color}
              strokeWidth="18"
              strokeDasharray={s.dasharray}
              strokeDashoffset={s.dashoffset}
            />
          ))}
        </g>
        <text x="66" y="61" textAnchor="middle" fontSize="22" fontWeight="500">
          {summary.totalScore}
        </text>
        <text x="66" y="78" textAnchor="middle" fontSize="10" fill="#898781">
          總分
        </text>
      </svg>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
        {SCORE_CATEGORIES.map((c) => {
          const value = scoreValueFor(summary, c.key);
          const isNegative = value < 0;
          return (
            <li key={c.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
              <span
                aria-hidden="true"
                style={{ width: "10px", height: "10px", borderRadius: "2px", background: c.color, flexShrink: 0 }}
              />
              <span>{c.label}</span>
              <span
                style={{ marginLeft: "auto", color: isNegative ? "#c0392b" : undefined, fontWeight: isNegative ? 600 : undefined }}
              >
                {isNegative ? value : `+${value}`.replace("+0", "0")}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
