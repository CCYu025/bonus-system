import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import type { FormStatus } from "@/generated/prisma/client";
import { createDailyForm, listForms } from "@/lib/forms";

export async function GET(req: NextRequest) {
  return withErrorHandling(() => {
    const status = req.nextUrl.searchParams.get("status") as FormStatus | null;
    return listForms({ status: status ?? undefined });
  });
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const body = await req.json();
    return createDailyForm(body.date, body.operatorName);
  });
}
