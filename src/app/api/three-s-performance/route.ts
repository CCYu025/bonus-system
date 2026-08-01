import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { createThreeSPerformance, listThreeSPerformances } from "@/lib/three-s-performance";
import { requireAuth, requireRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireAuth();
    const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "true";
    return listThreeSPerformances(activeOnly);
  });
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireRole("developer");
    const body = await req.json();
    return createThreeSPerformance(body);
  });
}
