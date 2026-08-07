import { withErrorHandling } from "@/lib/api-handler";
import { listComplianceRatingScoreRules } from "@/lib/compliance-rating-score-rules";
import { requireRole } from "@/lib/auth";

// 比照 /api/category-score-rules：唯讀查詢也限定 developer（見 plan.md 技術決策記錄 2）。
export async function GET() {
  return withErrorHandling(async () => {
    await requireRole("developer");
    return listComplianceRatingScoreRules();
  });
}
