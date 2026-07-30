import { withErrorHandling } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { getFormWithRecords } from "@/lib/forms";
import { requireAuth } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    await requireAuth();
    const { id } = await params;
    const form = await getFormWithRecords(id);
    if (!form) throw new AppError(404, "找不到表單");
    return form;
  });
}
