import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { queryScoresByMonth } from "@/lib/score-query";
import { requireAuth } from "@/lib/auth";

// 權限比照 /api/attendance-query/by-month：僅 requireAuth，foreman／developer
// 皆可查詢（spec FR-6 / AC-13 / AC-14），不呼叫 requireRole。
export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireAuth();
    const month = req.nextUrl.searchParams.get("month") ?? "";
    return queryScoresByMonth(month);
  });
}
