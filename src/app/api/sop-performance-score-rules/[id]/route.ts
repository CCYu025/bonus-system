import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { upsertSopPerformanceScoreRule } from "@/lib/sop-performance-score-rules";
import { requireRole } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const { user } = await requireRole("developer");
    const { id } = await params;
    const body = await req.json();
    return upsertSopPerformanceScoreRule(id, body.points, user.displayName);
  });
}
