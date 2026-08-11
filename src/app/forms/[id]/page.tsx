"use client";

import { Suspense, use, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/auth-client";

type Category = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  // docs/2026-08-03-attendance-leave-lock-sop-field：事假/病假/特休為 true，
  // 該類別鎖定同列加班時數/配合度/3S表現/SOP表現/實際產量（備註不受影響）。
  locksExtendedFields: boolean;
};

type ComplianceRating = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

type ThreeSPerformance = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  // 「正常」這筆為 true，做為切換出勤類別解除鎖定時的自動預設值來源（AC-7）。
  isLocked: boolean;
};

type SopPerformance = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  isLocked: boolean;
};

type RecordItem = {
  id: string;
  employeeId: string;
  categoryId: string | null;
  note: string | null;
  overtimeHours: number | null;
  complianceRatingId: string | null;
  threeSPerformanceId: string | null;
  actualQuantity: number | null;
  sopPerformanceId: string | null;
  voided: boolean;
  person: { name: string };
  category: { id: string; name: string } | null;
  complianceRating: { id: string; name: string } | null;
  threeSPerformance: { id: string; name: string } | null;
  sopPerformance: { id: string; name: string } | null;
};

// docs/2026-08-11-attendance-sft-production-import：五類分類結果，形狀對應
// src/lib/attendance-import.ts 的 AttendanceImportClassification。
type ImportCandidate = {
  personId: string;
  employeeId: string;
  name: string;
  matchedBy: "employeeId" | "name";
};

type ImportMatchedItem = { personId: string; employeeId: string; name: string; quantity: number };
type ImportNeedsReviewItem = {
  reportEmployeeId: string;
  reportName: string;
  quantity: number;
  candidates: ImportCandidate[];
};
type ImportSkippedItem = { personId: string; employeeId: string; name: string };
type ImportNoExcelDataItem = { personId: string; employeeId: string; name: string };
type ImportUnmatchedItem = { reportEmployeeId: string; reportName: string; quantity: number };

type ImportClassification = {
  matched: ImportMatchedItem[];
  needsReview: ImportNeedsReviewItem[];
  skippedWrongCategory: ImportSkippedItem[];
  noExcelData: ImportNoExcelDataItem[];
  unmatchedInExcel: ImportUnmatchedItem[];
};

type AuditLogItem = {
  id: string;
  action: string;
  operatorName: string;
  note: string | null;
  createdAt: string;
};

type FormDetail = {
  id: string;
  date: string;
  status: string;
  version: number;
  rejectReason: string | null;
  previousFormId: string | null;
  nextForm: { id: string } | null;
  records: RecordItem[];
  auditLogs: AuditLogItem[];
};

// 可編輯欄位——出勤類別為未填（null）時，其餘欄位（含備註）皆鎖定/清空；
// 出勤類別為請假鎖定類時，除備註外的其餘擴充欄位鎖定/清空（AC-1/AC-2/AC-6/AC-7），
// 對應後端 saveFormRecords 的同一套規則（NFR-1）。
type EditState = {
  categoryId: string | null;
  note: string;
  overtimeHours: number | null;
  complianceRatingId: string | null;
  threeSPerformanceId: string | null;
  actualQuantity: number | null;
  sopPerformanceId: string | null;
};

// 上限由 10 擴大為 12：docs/2026-08-04-attendance-scoring-rules/spec.md AC-8，
// 對 docs/2026-08-01-attendance-extended-fields/spec.md AC-3 的顯式修訂
// （假日加班積分規則需涵蓋超過 8 小時的情境）。
const OVERTIME_HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  pending_review: "待審",
  approved: "已核准",
  rejected: "已退回",
  voided: "已作廢",
};

const ACTION_LABEL: Record<string, string> = {
  created: "建立表單",
  saved_draft: "儲存草稿",
  submitted: "送出待審",
  approved: "核准",
  rejected: "退回",
  voided_resubmitted: "作廢重審",
};

export default function FormDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="container">載入中...</div>}>
      <FormDetailPageInner params={params} />
    </Suspense>
  );
}

function FormDetailPageInner({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const isSupervisor = searchParams.get("mode") === "supervisor";

  const [form, setForm] = useState<FormDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [complianceRatings, setComplianceRatings] = useState<ComplianceRating[]>([]);
  const [threeSPerformances, setThreeSPerformances] = useState<ThreeSPerformance[]>([]);
  const [sopPerformances, setSopPerformances] = useState<SopPerformance[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportClassification | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await authFetch(`/api/forms/${id}`);
    if (!res.ok) {
      setError("找不到表單");
      return;
    }
    setForm(await res.json());
  }, [id]);

  useEffect(() => {
    async function fetchData() {
      await load();
      authFetch("/api/categories?activeOnly=true")
        .then((r) => (r.ok ? r.json() : []))
        .then(setCategories);
      authFetch("/api/compliance-ratings?activeOnly=true")
        .then((r) => (r.ok ? r.json() : []))
        .then(setComplianceRatings);
      authFetch("/api/three-s-performance?activeOnly=true")
        .then((r) => (r.ok ? r.json() : []))
        .then(setThreeSPerformances);
      authFetch("/api/sop-performance?activeOnly=true")
        .then((r) => (r.ok ? r.json() : []))
        .then(setSopPerformances);
    }
    fetchData();
  }, [load]);

  const editable = form && ["draft", "rejected"].includes(form.status);

  // 出勤類別是否屬於請假鎖定類（事假/病假/特休）；null（未選）也視為鎖定
  // （對應後端 saveFormRecords 的 isLockedCategory，見 docs/database.md 的說明）。
  function isLockedCategoryId(categoryId: string | null): boolean {
    if (categoryId === null) return true;
    const category = categories.find((c) => c.id === categoryId);
    return category?.locksExtendedFields === true;
  }

  function getFieldValue<K extends keyof EditState>(r: RecordItem, field: K): EditState[K] {
    const edit = edits[r.employeeId];
    if (edit) return edit[field];
    if (field === "note") return (r.note ?? "") as EditState[K];
    return r[field] as EditState[K];
  }

  function setField<K extends keyof EditState>(r: RecordItem, field: K, value: EditState[K]) {
    setEdits((prev) => {
      const base: EditState =
        prev[r.employeeId] ?? {
          categoryId: r.categoryId,
          note: r.note ?? "",
          overtimeHours: r.overtimeHours,
          complianceRatingId: r.complianceRatingId,
          threeSPerformanceId: r.threeSPerformanceId,
          actualQuantity: r.actualQuantity,
          sopPerformanceId: r.sopPerformanceId,
        };
      const next: EditState = { ...base, [field]: value };

      if (field === "categoryId") {
        const newCategoryId = value as string | null;
        const wasLocked = isLockedCategoryId(base.categoryId);

        if (newCategoryId === null) {
          // AC-7（未選）：同列其餘欄位（含備註）立即清空，讓 UI 馬上反映鎖定效果；
          // 實際的資料完整性仍由後端 saveFormRecords 保證（NFR-1）。
          next.note = "";
          next.overtimeHours = null;
          next.complianceRatingId = null;
          next.threeSPerformanceId = null;
          next.sopPerformanceId = null;
          next.actualQuantity = null;
        } else if (isLockedCategoryId(newCategoryId)) {
          // AC-2（請假鎖定類）：清空五個擴充欄位，備註維持不變、仍可編輯。
          next.overtimeHours = null;
          next.complianceRatingId = null;
          next.threeSPerformanceId = null;
          next.sopPerformanceId = null;
          next.actualQuantity = null;
        } else if (wasLocked) {
          // AC-7：由鎖定狀態切為可自由填寫類別，若3S表現/SOP表現未指定值，
          // 自動帶入各自清單中「正常」（isLocked）選項，鏡射後端同一條規則。
          if (next.threeSPerformanceId === null) {
            const def = threeSPerformances.find((t) => t.isLocked);
            if (def) next.threeSPerformanceId = def.id;
          }
          if (next.sopPerformanceId === null) {
            const def = sopPerformances.find((s) => s.isLocked);
            if (def) next.sopPerformanceId = def.id;
          }
        }
      }

      return { ...prev, [r.employeeId]: next };
    });
  }

  async function handleSave() {
    const changes = Object.entries(edits).map(([employeeId, v]) => ({
      employeeId,
      categoryId: v.categoryId,
      note: v.note,
      overtimeHours: v.overtimeHours,
      complianceRatingId: v.complianceRatingId,
      threeSPerformanceId: v.threeSPerformanceId,
      actualQuantity: v.actualQuantity,
      sopPerformanceId: v.sopPerformanceId,
    }));
    if (changes.length === 0) {
      setError("尚無變更內容");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/forms/${id}/records`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "儲存失敗");
      setForm(data);
      setEdits({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  // AC-6/FR-9：畫面上每位人員「當下有效」的出勤類別（優先用尚未儲存的 edits，
  // 沒有異動才 fallback 用表單已存的 categoryId），隨檔案一起送給匯入 API。
  function buildEffectiveCategories(): Record<string, string | null> {
    const result: Record<string, string | null> = {};
    for (const r of form!.records) {
      result[r.employeeId] = getFieldValue(r, "categoryId");
    }
    return result;
  }

  async function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // AC-19：清空 value 讓使用者可以重新選同一個檔案再匯入一次
    if (!file || !form) return;

    setImportBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("effectiveCategories", JSON.stringify(buildEffectiveCategories()));
      const res = await authFetch(`/api/forms/${id}/import-sft`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "匯入失敗");
      setImportPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "匯入失敗");
    } finally {
      setImportBusy(false);
    }
  }

  // AC-8/AC-8a/AC-16：只把 matched 清單的數量寫進 edits state（沿用既有
  // setField，不另外寫一套 state 更新邏輯），不呼叫任何存檔 API，資料庫維持不變。
  function handleApplyImport() {
    if (!importPreview || !form) return;
    for (const item of importPreview.matched) {
      const record = form.records.find((r) => r.employeeId === item.employeeId);
      if (record) setField(record, "actualQuantity", item.quantity);
    }
    setImportPreview(null);
  }

  function handleCancelImport() {
    setImportPreview(null);
  }

  async function handleAction(
    action: "submit" | "approve" | "reject" | "void",
    extra?: Record<string, unknown>
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/forms/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "操作失敗");
      setForm(data);
      setEdits({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }

  if (!form) {
    return (
      <div className="container">
        {error ? <div className="error-box">{error}</div> : "載入中..."}
      </div>
    );
  }

  const filledCount = form.records.filter((r) => r.categoryId).length;

  return (
    <div className="container">
      <h1>
        {form.date} 出勤表單 v{form.version}{" "}
        <span className={`badge ${form.status}`}>
          {STATUS_LABEL[form.status] ?? form.status}
        </span>
      </h1>
      <p className="hint">
        {isSupervisor ? "開發者模式（核准／退回）" : "班長模式（填寫／送審）"} ·{" "}
        <Link href={isSupervisor ? "/forms?mode=supervisor" : "/forms"}>
          返回列表
        </Link>
      </p>

      {form.previousFormId && (
        <p className="hint">
          本表單為重審版本，前一版本：
          <Link href={`/forms/${form.previousFormId}`}>{form.previousFormId}</Link>
        </p>
      )}
      {form.nextForm && (
        <p className="hint">
          本表單已被作廢重審，新版本：
          <Link href={`/forms/${form.nextForm.id}`}>{form.nextForm.id}</Link>
        </p>
      )}
      {form.status === "rejected" && form.rejectReason && (
        <p className="error-box">退回原因：{form.rejectReason}</p>
      )}

      {error && <div className="error-box">{error}</div>}

      {!editable && form.status !== "voided" && (
        <div className="inline-form">
          <span className="hint">
            {form.status === "approved"
              ? "已核准表單不可直接修改，如需更正請使用作廢重審"
              : "待審中，等候開發者審核"}
          </span>
        </div>
      )}

      <p className="hint">
        已填 {filledCount} / {form.records.length} 人
      </p>

      {/* AC-13：表格橫向捲動，超出視窗時不裁切資料（3S表現/SOP表現欄位另有寬度限制，見下方）。 */}
      <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>工號</th>
            <th>姓名</th>
            <th>出勤類別</th>
            {/* AC-5（AMENDED 2026-08-04）：實際產量為每日必填欄位，優先度高於選填的
                加班時數等欄位，移至出勤類別之後。 */}
            <th>實際產量</th>
            <th>加班時數</th>
            <th>配合度</th>
            <th>3S表現</th>
            <th>SOP表現</th>
            <th>備註</th>
          </tr>
        </thead>
        <tbody>
          {form.records.map((r) => {
            const currentCategoryId = getFieldValue(r, "categoryId");
            // AC-6：出勤類別未填時，同列其餘欄位（含備註）皆鎖定為不可編輯。
            const hardLocked = currentCategoryId === null;
            // AC-1：出勤類別為請假鎖定類（事假/病假/特休）時，除備註外的擴充欄位鎖定。
            const softLocked = !hardLocked && isLockedCategoryId(currentCategoryId);
            const otherFieldsEditable = editable && !hardLocked && !softLocked;
            const noteEditable = editable && !hardLocked;

            return (
              <tr key={r.id}>
                <td>{r.employeeId}</td>
                <td>{r.person.name}</td>
                <td>
                  {editable ? (
                    <select
                      value={getFieldValue(r, "categoryId") ?? ""}
                      onChange={(e) =>
                        setField(r, "categoryId", e.target.value || null)
                      }
                    >
                      <option value="">未填</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    r.category?.name ?? "未填"
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      type="number"
                      min="1"
                      step="1"
                      // AC-12：寬度調整為調整前實測渲染寬度（約 192.8px）的一半。
                      style={{ width: "96px" }}
                      disabled={!otherFieldsEditable}
                      value={getFieldValue(r, "actualQuantity") ?? ""}
                      onChange={(e) =>
                        setField(
                          r,
                          "actualQuantity",
                          e.target.value === "" ? null : Number(e.target.value)
                        )
                      }
                    />
                  ) : (
                    r.actualQuantity ?? ""
                  )}
                </td>
                <td>
                  {editable ? (
                    <select
                      disabled={!otherFieldsEditable}
                      value={getFieldValue(r, "overtimeHours") ?? ""}
                      onChange={(e) =>
                        setField(
                          r,
                          "overtimeHours",
                          e.target.value === "" ? null : Number(e.target.value)
                        )
                      }
                    >
                      <option value="">未選</option>
                      {OVERTIME_HOUR_OPTIONS.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  ) : (
                    r.overtimeHours ?? ""
                  )}
                </td>
                <td>
                  {editable ? (
                    <select
                      disabled={!otherFieldsEditable}
                      value={getFieldValue(r, "complianceRatingId") ?? ""}
                      onChange={(e) =>
                        setField(r, "complianceRatingId", e.target.value || null)
                      }
                    >
                      <option value="">未選</option>
                      {complianceRatings.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    r.complianceRating?.name ?? ""
                  )}
                </td>
                <td>
                  {editable ? (
                    <select
                      disabled={!otherFieldsEditable}
                      // AC-13：欄寬限制在調整前實測寬度（約334px）的一半以下，過長文字
                      // 截斷並以 title 顯示完整內容（hover 或展開下拉皆可看到全文）。
                      style={{
                        maxWidth: "150px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={
                        threeSPerformances.find(
                          (c) => c.id === getFieldValue(r, "threeSPerformanceId")
                        )?.name
                      }
                      value={getFieldValue(r, "threeSPerformanceId") ?? ""}
                      onChange={(e) =>
                        setField(r, "threeSPerformanceId", e.target.value || null)
                      }
                    >
                      {/* AC-6：不提供「未選」選項；此 placeholder 僅在既有值為 null
                          時顯示、且使用者無法手動選取，避免誤導成已選清單第一項
                          （既有舊資料或尚未觸發 AC-7 自動預設的合法 null，見 AC-11）。 */}
                      {getFieldValue(r, "threeSPerformanceId") === null && (
                        <option value="" disabled hidden>
                          （未設定）
                        </option>
                      )}
                      {threeSPerformances.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    r.threeSPerformance?.name ?? ""
                  )}
                </td>
                <td>
                  {editable ? (
                    <select
                      disabled={!otherFieldsEditable}
                      // AC-13：欄寬限制在調整前實測寬度（約386px）的一半以下。
                      style={{
                        maxWidth: "150px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={
                        sopPerformances.find(
                          (c) => c.id === getFieldValue(r, "sopPerformanceId")
                        )?.name
                      }
                      value={getFieldValue(r, "sopPerformanceId") ?? ""}
                      onChange={(e) =>
                        setField(r, "sopPerformanceId", e.target.value || null)
                      }
                    >
                      {/* AC-6：同 3S表現，不提供「未選」選項。 */}
                      {getFieldValue(r, "sopPerformanceId") === null && (
                        <option value="" disabled hidden>
                          （未設定）
                        </option>
                      )}
                      {sopPerformances.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    r.sopPerformance?.name ?? ""
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      disabled={!noteEditable}
                      value={getFieldValue(r, "note") ?? ""}
                      onChange={(e) => setField(r, "note", e.target.value)}
                    />
                  ) : (
                    r.note ?? ""
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      <div className="inline-form">
        {editable && (
          <>
            {/* AC-1/AC-19：檔案選取上傳介面，不監看任何固定資料夾路徑。 */}
            <input
              type="file"
              accept=".xls,.xlsx"
              ref={importFileInputRef}
              style={{ display: "none" }}
              onChange={handleImportFileChange}
            />
            <button
              type="button"
              onClick={() => importFileInputRef.current?.click()}
              disabled={busy || importBusy}
            >
              匯入SFT生產日報表
            </button>
            <button onClick={handleSave} disabled={busy}>
              儲存草稿
            </button>
            <button onClick={() => handleAction("submit")} disabled={busy}>
              確認送出待審
            </button>
          </>
        )}

        {isSupervisor && form.status === "pending_review" && (
          <>
            <button onClick={() => handleAction("approve")} disabled={busy}>
              核准
            </button>
            <input
              placeholder="退回原因（選填）"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <button
              onClick={() => handleAction("reject", { reason: rejectReason })}
              disabled={busy}
            >
              退回
            </button>
          </>
        )}

        {form.status === "approved" && (
          <button onClick={() => handleAction("void")} disabled={busy}>
            作廢重審
          </button>
        )}
      </div>

      {importPreview && (
        <div className="inline-form">
          <h2>匯入SFT生產日報表 — 確認套用</h2>

          <h3>將套用（{importPreview.matched.length} 人）</h3>
          <ul>
            {importPreview.matched.map((m) => {
              const record = form.records.find((r) => r.employeeId === m.employeeId);
              const currentValue = record ? getFieldValue(record, "actualQuantity") : null;
              const willOverwrite = currentValue !== null;
              // AC-14：將被覆蓋時同時顯示原值與新值；單一文字節點，方便測試斷言。
              const text = willOverwrite
                ? `${m.employeeId} ${m.name}：${m.quantity} 將被覆蓋（原值：${currentValue} → 新值：${m.quantity}）`
                : `${m.employeeId} ${m.name}：${m.quantity}`;
              return <li key={m.employeeId}>{text}</li>;
            })}
          </ul>

          {importPreview.needsReview.length > 0 && (
            <>
              <h3>需人工確認（{importPreview.needsReview.length} 筆）</h3>
              <ul>
                {importPreview.needsReview.map((n, i) => {
                  const candidateText = n.candidates.map((c) => `${c.name}（${c.employeeId}）`).join("、");
                  return (
                    <li key={i}>
                      {`報表工號 ${n.reportEmployeeId}／姓名 ${n.reportName}／數量 ${n.quantity} 候選：${candidateText}`}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {importPreview.skippedWrongCategory.length > 0 && (
            <>
              <h3>出勤類別不符，未匯入（{importPreview.skippedWrongCategory.length} 人）</h3>
              <ul>
                {importPreview.skippedWrongCategory.map((s) => (
                  <li key={s.employeeId}>{`${s.employeeId} ${s.name}`}</li>
                ))}
              </ul>
            </>
          )}

          {importPreview.noExcelData.length > 0 && (
            <>
              <h3>報表查無資料，維持原值（{importPreview.noExcelData.length} 人）</h3>
              <ul>
                {importPreview.noExcelData.map((n) => (
                  <li key={n.employeeId}>{`${n.employeeId} ${n.name}`}</li>
                ))}
              </ul>
            </>
          )}

          {importPreview.unmatchedInExcel.length > 0 && (
            <>
              <h3>報表資料查無對應人員（{importPreview.unmatchedInExcel.length} 筆）</h3>
              <ul>
                {importPreview.unmatchedInExcel.map((u, i) => (
                  <li key={i}>{`${u.reportEmployeeId} ${u.reportName} 數量 ${u.quantity}`}</li>
                ))}
              </ul>
            </>
          )}

          <button type="button" onClick={handleApplyImport}>
            確認套用
          </button>
          <button type="button" onClick={handleCancelImport}>
            取消
          </button>
        </div>
      )}

      <h2>異動軌跡</h2>
      <table>
        <thead>
          <tr>
            <th>時間</th>
            <th>動作</th>
            <th>操作者</th>
            <th>備註</th>
          </tr>
        </thead>
        <tbody>
          {form.auditLogs.map((a) => (
            <tr key={a.id}>
              <td>{new Date(a.createdAt).toLocaleString()}</td>
              <td>{ACTION_LABEL[a.action] ?? a.action}</td>
              <td>{a.operatorName}</td>
              <td>{a.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
