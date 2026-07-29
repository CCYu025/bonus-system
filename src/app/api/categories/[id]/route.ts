import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { setCategoryActive } from "@/lib/categories";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const { id } = await params;
    const body = await req.json();
    return setCategoryActive(id, Boolean(body.isActive));
  });
}
