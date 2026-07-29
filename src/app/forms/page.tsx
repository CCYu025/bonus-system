"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type FormListItem = {
  id: string;
  date: string;
  status: string;
  version: number;
  _count: { records: number };
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  pending_review: "待審",
  approved: "已核准",
  rejected: "已退回",
  voided: "已作廢",
};

export default function FormsPage() {
  return (
    <Suspense fallback={<div className="container">載入中...</div>}>
      <FormsPageInner />
    </Suspense>
  );
}

function FormsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSupervisor = searchParams.get("mode") === "supervisor";

  const [forms, setForms] = useState<FormListItem[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [operatorName, setOperatorName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const qs = isSupervisor ? "?status=pending_review" : "";
    const res = await fetch(`/api/forms${qs}`);
    setForms(await res.json());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupervisor]);

  async function handleOpenOrCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, operatorName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "開啟表單失敗");
      router.push(`/forms/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "開啟表單失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <h1>{isSupervisor ? "待審核表單（課長模式）" : "出勤表單（班長模式）"}</h1>

      {isSupervisor ? (
        <p className="hint">
          顯示所有狀態為「待審」的表單，不因填寫班長不同而篩選或隱藏（AC-12）。
        </p>
      ) : (
        <>
          <p className="hint">
            選擇日期並輸入你的姓名作為本次填寫階段的操作者身分；若該日表單已存在，將直接開啟既有表單。
          </p>
          {error && <div className="error-box">{error}</div>}
          <form className="inline-form" onSubmit={handleOpenOrCreate}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            <input
              placeholder="操作者姓名"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              開啟／建立表單
            </button>
          </form>
        </>
      )}

      <h2>表單列表</h2>
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>版本</th>
            <th>狀態</th>
            <th>人員數</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {forms.map((f) => (
            <tr key={f.id}>
              <td>{f.date}</td>
              <td>v{f.version}</td>
              <td>
                <span className={`badge ${f.status}`}>
                  {STATUS_LABEL[f.status] ?? f.status}
                </span>
              </td>
              <td>{f._count.records}</td>
              <td>
                <Link href={`/forms/${f.id}${isSupervisor ? "?mode=supervisor" : ""}`}>
                  開啟
                </Link>
              </td>
            </tr>
          ))}
          {forms.length === 0 && (
            <tr>
              <td colSpan={5}>
                {isSupervisor ? "目前沒有待審表單" : "尚無表單"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
