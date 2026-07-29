import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { approveForm } from "@/lib/forms";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const { id } = await params;
    const body = await req.json();
    return approveForm(id, body.operatorName);
  });
}
