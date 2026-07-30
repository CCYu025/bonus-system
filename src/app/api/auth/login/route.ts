import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { authenticateUser } from "@/lib/accounts";
import { createSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const body = await req.json();
    const { username, password } = body;
    if (!username || !password) {
      throw new AppError(401, "帳號或密碼錯誤");
    }

    const user = await authenticateUser(username, password);
    if (!user) {
      // AC-2: single generic message regardless of which part was wrong.
      throw new AppError(401, "帳號或密碼錯誤");
    }

    await createSession(user.id);

    return {
      role: user.role,
      displayName: user.displayName,
    };
  });
}
