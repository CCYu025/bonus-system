import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { upsertThreeSPerformanceScoreRule } from "@/lib/three-s-performance-score-rules";
import { requireRole } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const { user } = await requireRole("developer");
    const { id } = await params;
    const body = await req.json();
    return upsertThreeSPerformanceScoreRule(id, body.points, user.displayName);
  });
}
