import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { queryScoresByMonth } from "@/lib/score-query";

// docs/2026-08-14-employee-score-dashboard/spec.md NFR-1：刻意不呼叫
// requireAuth/requireRole——這是使用者在需求討論階段已確認的產品決策（考核
// 人數規模小，工廠現場資訊本就相對透明），不是忘記加驗證。分數計算完全複用
// 既有 queryScoresByMonth，不另建一套計分邏輯（NFR-2）。
export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const month = req.nextUrl.searchParams.get("month") ?? "";
    return queryScoresByMonth(month);
  });
}
