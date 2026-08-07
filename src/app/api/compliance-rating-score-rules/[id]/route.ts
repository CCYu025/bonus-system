import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { upsertComplianceRatingScoreRule } from "@/lib/compliance-rating-score-rules";
import { requireRole } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const { user } = await requireRole("developer");
    const { id } = await params;
    const body = await req.json();
    return upsertComplianceRatingScoreRule(id, body.points, user.displayName);
  });
}
