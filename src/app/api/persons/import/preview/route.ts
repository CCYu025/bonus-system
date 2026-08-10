import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { classifyImportRows, parseSftReport } from "@/lib/persons-import";

// T-6 / NFR-1: this route only parses + classifies, it never writes to the
// database — deliberately kept in its own file/route from /import/apply so
// that stays true at the file level, not just by convention.
export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireRole(["foreman", "developer"]);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError(400, "請上傳檔案");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = parseSftReport(buffer);
    return classifyImportRows(rows);
  });
}
