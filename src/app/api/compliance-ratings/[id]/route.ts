import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { updateComplianceRating } from "@/lib/compliance-ratings";
import { requireRole } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    await requireRole("developer");
    const { id } = await params;
    const body = await req.json();
    return updateComplianceRating(id, body);
  });
}
