import { withErrorHandling } from "@/lib/api-handler";
import { destroyCurrentSession } from "@/lib/auth";

export async function POST() {
  return withErrorHandling(async () => {
    await destroyCurrentSession();
    return { ok: true };
  });
}
