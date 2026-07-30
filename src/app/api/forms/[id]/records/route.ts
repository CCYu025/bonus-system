import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { saveFormRecords } from "@/lib/forms";
import { requireAuth } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const { user } = await requireAuth();
    const { id } = await params;
    const body = await req.json();
    return saveFormRecords(id, user.displayName, body.changes);
  });
}
