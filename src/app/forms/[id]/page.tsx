"use client";

import { Suspense, use, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Category = {
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
  voided: boolean;
  person: { name: string };
  category: { id: string; name: string } | null;
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
  const [edits, setEdits] = useState<
    Record<string, { categoryId: string | null; note: string }>
  >({});
  const [operatorName, setOperatorName] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/forms/${id}`);
    if (!res.ok) {
      setError("找不到表單");
      return;
    }
    setForm(await res.json());
  }, [id]);

  useEffect(() => {
    load();
    fetch("/api/categories?activeOnly=true")
      .then((r) => r.json())
      .then(setCategories);
  }, [load]);

  const editable = form && ["draft", "rejected"].includes(form.status);

  function getFieldValue(r: RecordItem, field: "categoryId" | "note") {
    const edit = edits[r.employeeId];
    if (edit) return edit[field];
    return field === "categoryId" ? r.categoryId : r.note ?? "";
  }

  function setField(
    r: RecordItem,
    field: "categoryId" | "note",
    value: string | null
  ) {
    setEdits((prev) => ({
      ...prev,
      [r.employeeId]: {
        categoryId:
          field === "categoryId" ? value : prev[r.employeeId]?.categoryId ?? r.categoryId,
        note: field === "note" ? value ?? "" : prev[r.employeeId]?.note ?? r.note ?? "",
      },
    }));
  }

  async function handleSave() {
    if (!operatorName.trim()) {
      setError("請輸入操作者姓名");
      return;
    }
    const changes = Object.entries(edits).map(([employeeId, v]) => ({
      employeeId,
      categoryId: v.categoryId,
      note: v.note,
    }));
    if (changes.length === 0) {
      setError("尚無變更內容");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/forms/${id}/records`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorName, changes }),
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
    if (!operatorName.trim()) {
      setError("請輸入操作者姓名");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/forms/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorName, ...extra }),
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
        {isSupervisor ? "課長模式（核准／退回）" : "班長模式（填寫／送審）"} ·{" "}
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

      <div className="inline-form">
        <input
          placeholder="操作者姓名"
          value={operatorName}
          onChange={(e) => setOperatorName(e.target.value)}
        />
        {!editable && form.status !== "voided" && (
          <span className="hint">
            {form.status === "approved"
              ? "已核准表單不可直接修改，如需更正請使用作廢重審"
              : "待審中，等候課長審核"}
          </span>
        )}
      </div>

      <p className="hint">
        已填 {filledCount} / {form.records.length} 人
      </p>

      <table>
        <thead>
          <tr>
            <th>工號</th>
            <th>姓名</th>
            <th>出勤類別</th>
            <th>備註</th>
          </tr>
        </thead>
        <tbody>
          {form.records.map((r) => (
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
                    value={getFieldValue(r, "note") ?? ""}
                    onChange={(e) => setField(r, "note", e.target.value)}
                  />
                ) : (
                  r.note ?? ""
                )}
              </td>
            </tr>
          ))}
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
