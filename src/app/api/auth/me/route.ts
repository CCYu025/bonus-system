import { withErrorHandling } from "@/lib/api-handler";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  return withErrorHandling(async () => {
    const session = await requireAuth();
    return {
      role: session.user.role,
      displayName: session.user.displayName,
    };
  });
}
