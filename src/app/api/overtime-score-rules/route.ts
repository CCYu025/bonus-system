import { withErrorHandling } from "@/lib/api-handler";
import { listOvertimeScoreRules } from "@/lib/overtime-score-rules";
import { requireRole } from "@/lib/auth";

// 同 /api/category-score-rules：唯讀查詢也限定 developer（AC-11）。
export async function GET() {
  return withErrorHandling(async () => {
    await requireRole("developer");
    return listOvertimeScoreRules();
  });
}
