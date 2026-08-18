import type { PersonScoreSummary } from "@/lib/score-query";

// docs/2026-08-14-employee-score-dashboard/spec.md AC-9/AC-11：同一項分數在
// 甜甜圈圖（T-9）與堆疊長條圖（T-11）上永遠是同一個顏色，兩張圖表共用這份
// 唯一的對應表，避免各自維護一份而漂移。key 對應 PersonScoreSummary 的欄位名。
export type ScoreCategoryKey =
  | "categoryScore"
  | "overtimeScore"
  | "complianceScore"
  | "threeSScore"
  | "sopScore";

export type ScoreCategoryDef = {
  key: ScoreCategoryKey;
  label: string;
  color: string;
};

export const SCORE_CATEGORIES: ScoreCategoryDef[] = [
  { key: "categoryScore", label: "出勤類別分", color: "#2a78d6" },
  { key: "overtimeScore", label: "加班分", color: "#eb6834" },
  { key: "complianceScore", label: "配合度分", color: "#1baf7a" },
  { key: "threeSScore", label: "3S分", color: "#eda100" },
  { key: "sopScore", label: "SOP分", color: "#e87ba4" },
];

export function scoreValueFor(summary: PersonScoreSummary, key: ScoreCategoryKey): number {
  return summary[key];
}
