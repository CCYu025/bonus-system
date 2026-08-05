import { withErrorHandling } from "@/lib/api-handler";
import { listCategoryScoreRules } from "@/lib/category-score-rules";
import { requireRole } from "@/lib/auth";

// 注意：不沿用 /api/categories 現有的 requireAuth-only 慣例——積分規則連唯讀
// 查詢都限定 developer 才能存取（見 spec FR-3/NFR-1/AC-11）。
export async function GET() {
  return withErrorHandling(async () => {
    await requireRole("developer");
    return listCategoryScoreRules();
  });
}
