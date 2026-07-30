import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { rejectForm } from "@/lib/forms";
import { requireRole } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const { user } = await requireRole("developer");
    const { id } = await params;
    const body = await req.json();
    return rejectForm(id, user.displayName, body.reason);
  });
}
