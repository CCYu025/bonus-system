import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { createCategory, listCategories } from "@/lib/categories";

export async function GET(req: NextRequest) {
  return withErrorHandling(() => {
    const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "true";
    return listCategories(activeOnly);
  });
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const body = await req.json();
    return createCategory({
      code: body.code,
      name: body.name,
      sortOrder: body.sortOrder,
    });
  });
}
