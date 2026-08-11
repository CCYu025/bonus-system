import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { requireRole } from "@/lib/auth";
import { applyImportSelections, type ImportSelection } from "@/lib/persons-import";

// T-7 / AC-9: only ever applies whatever selections the caller sends — the
// frontend is responsible for only sending checked items (plan.md 技術決策
// 記錄 #5), this route does not re-derive "checked" from anything else.
export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireRole(["foreman", "developer"]);

    const body = await req.json();
    const selections = (body.selections ?? []) as ImportSelection[];
    return applyImportSelections(selections);
  });
}
