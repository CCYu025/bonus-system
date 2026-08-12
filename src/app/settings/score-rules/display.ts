// 純顯示邏輯，無 DB 依賴——比照 src/app/attendance-query/filters.ts 的純邏輯拆分慣例，
// 用一般 Vitest（不需 jsdom）測試字串輸出（AC-3/AC-5/AC-6）。

function formatSignedPoints(points: number): string {
  return points >= 0 ? `+${points}` : `${points}`;
}

// AC-3：未設定積分的類別顯示為「未設定」，不得顯示或推導成 0。
export function formatCategoryPoints(points: number | null): string {
  return points === null ? "未設定" : formatSignedPoints(points);
}

export type OvertimeRuleForDisplay = {
  minHours: number;
  maxHours: number | null;
  points: number;
  pointsPerExtraHour: number | null;
};

// AC-5/AC-6：把 seed 好的固定級距規則格式化成顯示文字，不做任何依加班時數
// 即時計算積分的邏輯（Out of scope）。
export function formatOvertimeRuleLabel(rule: OvertimeRuleForDisplay): string {
  if (rule.pointsPerExtraHour !== null) {
    // spec.md AC-6/FR-8 的例句原文是「100 ＋ 每小時 10」，這兩個數字刻意不帶正負號
    // （跟其餘級距的 formatSignedPoints 顯示不同，逐字比照 spec 文字）。
    return `超過 ${rule.minHours - 1} 小時 → ${rule.points} ＋ 每小時 ${rule.pointsPerExtraHour}`;
  }
  if (rule.maxHours === null) {
    return `${rule.minHours} 小時（含以上）→ ${formatSignedPoints(rule.points)}`;
  }
  if (rule.minHours === rule.maxHours) {
    return `${rule.minHours} 小時 → ${formatSignedPoints(rule.points)}`;
  }
  return `${rule.minHours}–${rule.maxHours} 小時 → ${formatSignedPoints(rule.points)}`;
}
