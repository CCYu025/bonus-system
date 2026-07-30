import { withErrorHandling } from "@/lib/api-handler";
import { voidAndResubmitForm } from "@/lib/forms";
import { requireRole } from "@/lib/auth";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const { user } = await requireRole("developer");
    const { id } = await params;
    return voidAndResubmitForm(id, user.displayName);
  });
}
