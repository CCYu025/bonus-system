import { withErrorHandling } from "@/lib/api-handler";
import { submitForm } from "@/lib/forms";
import { requireAuth } from "@/lib/auth";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const { user } = await requireAuth();
    const { id } = await params;
    return submitForm(id, user.displayName);
  });
}
