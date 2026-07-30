import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { setAccountActive, updateDisplayName } from "@/lib/accounts";
import { requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    await requireRole("developer");
    const { id } = await params;
    const body = await req.json();

    if (typeof body.isActive !== "boolean" && typeof body.displayName !== "string") {
      throw new AppError(400, "沒有可更新的欄位");
    }

    let result;
    if (typeof body.isActive === "boolean") {
      result = await setAccountActive(id, body.isActive);
    }
    if (typeof body.displayName === "string") {
      result = await updateDisplayName(id, body.displayName);
    }
    return result;
  });
}
