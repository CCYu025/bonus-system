import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { createAccount, listAccounts } from "@/lib/accounts";
import { requireRole } from "@/lib/auth";

export async function GET() {
  return withErrorHandling(async () => {
    await requireRole("developer");
    return listAccounts();
  });
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireRole("developer");
    const body = await req.json();
    return createAccount({
      username: body.username,
      password: body.password,
      role: body.role,
      displayName: body.displayName,
    });
  });
}
