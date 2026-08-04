import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { updateSopPerformance } from "@/lib/sop-performance";
import { requireRole } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    await requireRole("developer");
    const { id } = await params;
    const body = await req.json();
    return updateSopPerformance(id, body);
  });
}
