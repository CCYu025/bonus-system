import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { requireAuth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { assertEditable, getFormWithRecords } from "@/lib/forms";
import { prisma } from "@/lib/prisma";
import {
  classifyAttendanceImportRows,
  parseAttendanceSftReport,
  type FormPersonInput,
} from "@/lib/attendance-import";

// T-3 / AC-6/AC-15/AC-17/AC-18/NFR-1/NFR-3: 唯讀路由，只解析＋分類，不寫入資料庫
// （AC-15/NFR-1）。權限刻意只呼叫 requireAuth()，不額外呼叫 requireRole，與既有
// PATCH /api/forms/[id]/records 完全一致（FR-12/AC-18，見 plan.md 技術決策記錄第 6 項）。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    await requireAuth();
    const { id } = await params;

    const form = await getFormWithRecords(id);
    if (!form) throw new AppError(404, "找不到表單");
    assertEditable(form.status); // AC-17：非 draft/rejected 一律拒絕

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError(400, "請上傳檔案");
    }

    // FR-9：畫面上每位人員「目前有效」的出勤類別，涵蓋尚未儲存的編輯（AC-6）。
    const effectiveCategoriesRaw = formData.get("effectiveCategories");
    let effectiveCategoriesInput: Record<string, string | null> = {};
    if (typeof effectiveCategoriesRaw === "string" && effectiveCategoriesRaw.trim() !== "") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(effectiveCategoriesRaw);
      } catch {
        throw new AppError(400, "有效出勤類別資料不合法");
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new AppError(400, "有效出勤類別資料不合法");
      }
      effectiveCategoriesInput = parsed as Record<string, string | null>;
    }

    // NFR-3：key 必須是這張表單當下的人員名單，value 必須是合法 categoryId 或 null，
    // 不可讓請求內容指定表單以外的人員或不存在的 categoryId。
    const formEmployeeIds = new Set(form.records.map((r) => r.employeeId));
    const categories = await prisma.attendanceCategory.findMany({ select: { id: true, code: true } });
    const validCategoryIds = new Set(categories.map((c) => c.id));
    const categoryCodeById = new Map(categories.map((c) => [c.id, c.code]));

    for (const [employeeId, categoryId] of Object.entries(effectiveCategoriesInput)) {
      if (!formEmployeeIds.has(employeeId)) {
        throw new AppError(400, "有效出勤類別資料不合法");
      }
      if (categoryId !== null && (typeof categoryId !== "string" || !validCategoryIds.has(categoryId))) {
        throw new AppError(400, "有效出勤類別資料不合法");
      }
    }

    // AC-6：effectiveCategories 有指定該員的值就用它（含 null／未選），沒指定則以
    // 表單目前已存的 categoryId 為準。
    const formPersons: FormPersonInput[] = form.records.map((r) => {
      const overriddenCategoryId =
        r.employeeId in effectiveCategoriesInput ? effectiveCategoriesInput[r.employeeId] : r.categoryId;
      const effectiveCategoryCode = overriddenCategoryId
        ? categoryCodeById.get(overriddenCategoryId) ?? null
        : null;
      return {
        personId: r.personId,
        employeeId: r.employeeId,
        name: r.person.name,
        effectiveCategoryCode,
      };
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const reportRows = parseAttendanceSftReport(buffer, form.date);
    return classifyAttendanceImportRows(reportRows, formPersons);
  });
}
