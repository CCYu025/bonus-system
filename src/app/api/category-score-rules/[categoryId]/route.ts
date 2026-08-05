import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { upsertCategoryScoreRule } from "@/lib/category-score-rules";
import { requireRole } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  return withErrorHandling(async () => {
    const { user } = await requireRole("developer");
    const { categoryId } = await params;
    const body = await req.json();
    return upsertCategoryScoreRule(categoryId, body.points, user.displayName);
  });
}
