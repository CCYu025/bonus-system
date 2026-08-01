"use client";

import { Suspense, use, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/auth-client";

type Category = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
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
  voided: boolean;
  person: { name: string };
  category: { id: string; name: string } | null;
  complianceRating: { id: string; name: string } | null;
  threeSPerformance: { id: string; name: string } | null;
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

// 可編輯欄位——出勤類別為未填（null）時，其餘欄位（含備註）皆鎖定/清空
// （AC-6/AC-7），對應後端 saveFormRecords 的同一條規則（NFR-1）。
type EditState = {
  categoryId: string | null;
  note: string;
  overtimeHours: number | null;
  complianceRatingId: string | null;
  threeSPerformanceId: string | null;
  actualQuantity: number | null;
};

const OVERTIME_HOUR_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

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
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await authFetch(`/api/forms/${id}`);
    if (!res.ok) {
      setError("找不到表單");
      return;
    }
    setForm(await res.json());
  }, [id]);

  useEffect(() => {
    load();
    authFetch("/api/categories?activeOnly=true")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCategories);
    authFetch("/api/compliance-ratings?activeOnly=true")
      .then((r) => (r.ok ? r.json() : []))
      .then(setComplianceRatings);
    authFetch("/api/three-s-performance?activeOnly=true")
      .then((r) => (r.ok ? r.json() : []))
      .then(setThreeSPerformances);
  }, [load]);

  const editable = form && ["draft", "rejected"].includes(form.status);

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
        };
      const next: EditState = { ...base, [field]: value };
      // AC-7：出勤類別改回未選時，同列其餘欄位（含備註）立即清空，讓 UI 馬上
      // 反映鎖定效果；實際的資料完整性仍由後端 saveFormRecords 保證（NFR-1）。
      if (field === "categoryId" && value === null) {
        next.note = "";
        next.overtimeHours = null;
        next.complianceRatingId = null;
        next.threeSPerformanceId = null;
        next.actualQuantity = null;
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

      <table>
        <thead>
          <tr>
            <th>工號</th>
            <th>姓名</th>
            <th>出勤類別</th>
            <th>加班時數</th>
            <th>配合度</th>
            <th>3S表現</th>
            <th>實際產量</th>
            <th>備註</th>
          </tr>
        </thead>
        <tbody>
          {form.records.map((r) => {
            // AC-6：出勤類別未填時，同列其餘欄位（含備註）皆鎖定為不可編輯
            const rowLocked = getFieldValue(r, "categoryId") === null;
            const otherFieldsEditable = editable && !rowLocked;

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
                      value={getFieldValue(r, "threeSPerformanceId") ?? ""}
                      onChange={(e) =>
                        setField(r, "threeSPerformanceId", e.target.value || null)
                      }
                    >
                      <option value="">未選</option>
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
                    <input
                      type="number"
                      min="1"
                      step="1"
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
                    <input
                      disabled={!otherFieldsEditable}
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

      <div className="inline-form">
        {editable && (
          <>
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

        <button onClick={load} disabled={busy}>
          重新整理
        </button>
      </div>

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
