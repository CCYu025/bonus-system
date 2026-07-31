import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { listCategories } from "@/lib/categories";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireAuth();
    const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "true";
    return listCategories(activeOnly);
  });
}
