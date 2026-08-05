import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { updateOvertimeScoreRule } from "@/lib/overtime-score-rules";
import { requireRole } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const { user } = await requireRole("developer");
    const { id } = await params;
    const body = await req.json();
    return updateOvertimeScoreRule(id, body, user.displayName);
  });
}
