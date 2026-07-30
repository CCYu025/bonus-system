import { withErrorHandling } from "@/lib/api-handler";
import { approveForm } from "@/lib/forms";
import { requireRole } from "@/lib/auth";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const { user } = await requireRole("developer");
    const { id } = await params;
    return approveForm(id, user.displayName);
  });
}
