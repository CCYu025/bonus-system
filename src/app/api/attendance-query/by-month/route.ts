import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { queryAttendanceByMonth } from "@/lib/attendance-query";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireAuth();
    const month = req.nextUrl.searchParams.get("month") ?? "";
    return queryAttendanceByMonth(month);
  });
}
