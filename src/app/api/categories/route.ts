import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { createCategory, listCategories } from "@/lib/categories";
import { requireAuth, requireRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireAuth();
    const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "true";
    return listCategories(activeOnly);
  });
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireRole("developer");
    const body = await req.json();
    return createCategory({
      code: body.code,
      name: body.name,
      sortOrder: body.sortOrder,
    });
  });
}
