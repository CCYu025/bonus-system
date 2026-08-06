"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth-client";

type LookupItem = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  // 配合度清單的 API 回應不含此欄位，undefined 視為 falsy，不影響其既有行為
  // （docs/2026-08-03-attendance-leave-lock-sop-field：僅 3S表現／SOP表現的「正常」
  // 這一筆為 true，不可編輯或停用，見 src/lib/three-s-performance.ts／sop-performance.ts）。
  isLocked?: boolean;
};

type Draft = { code: string; name: string; sortOrder: number };

const EMPTY_DRAFT: Draft = { code: "", name: "", sortOrder: 0 };

type Props = {
  apiBase: string;
  // readonly：僅能停用/啟用（出勤類別專用，見 docs/2026-08-01-attendance-extended-fields
  // spec.md AC-1——新增類別視為新增計分詞彙，須經 code review，不開放畫面新增）。
  // editable：具備新增/編輯/排序/停用（配合度、3S表現）。
  mode: "readonly" | "editable";
};

export default function LookupListPanel({ apiBase, mode }: Props) {
  const [items, setItems] = useState<LookupItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [newDraft, setNewDraft] = useState<Draft>(EMPTY_DRAFT);

  async function load() {
    const res = await authFetch(apiBase);
    if (res.ok) setItems(await res.json());
  }

  useEffect(() => {
    async function fetchData() {
      await load();
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  async function toggleActive(item: LookupItem) {
    setError(null);
    const res = await authFetch(`${apiBase}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "更新失敗");
      return;
    }
    await load();
  }

  async function handleCreate() {
    setError(null);
    const res = await authFetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newDraft),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "新增失敗");
      return;
    }
    setNewDraft(EMPTY_DRAFT);
    await load();
  }

  function startEdit(item: LookupItem) {
    setEditingId(item.id);
    setEditDraft({ code: item.code, name: item.name, sortOrder: item.sortOrder });
  }

  async function handleUpdate(id: string) {
    setError(null);
    const res = await authFetch(`${apiBase}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDraft),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "更新失敗");
      return;
    }
    setEditingId(null);
    await load();
  }

  return (
    <div>
      {error && <div className="error-box">{error}</div>}

      <table>
        <thead>
          <tr>
            <th>業務代碼</th>
            <th>名稱</th>
            <th>排序</th>
            <th>狀態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) =>
            mode === "editable" && editingId === item.id ? (
              <tr key={item.id}>
                <td>
                  <input
                    value={editDraft.code}
                    onChange={(e) => setEditDraft((d) => ({ ...d, code: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    value={editDraft.name}
                    onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={editDraft.sortOrder}
                    onChange={(e) =>
                      setEditDraft((d) => ({ ...d, sortOrder: Number(e.target.value) }))
                    }
                  />
                </td>
                <td>{item.isActive ? "啟用" : "停用"}</td>
                <td>
                  <button onClick={() => handleUpdate(item.id)}>儲存</button>
                  <button onClick={() => setEditingId(null)}>取消</button>
                </td>
              </tr>
            ) : (
              <tr key={item.id}>
                <td>{item.code}</td>
                <td>{item.name}</td>
                <td>{item.sortOrder}</td>
                <td>{item.isActive ? "啟用" : "停用"}</td>
                <td>
                  {item.isLocked ? (
                    <span className="hint">系統鎖定，不可編輯或停用</span>
                  ) : (
                    <>
                      {mode === "editable" && (
                        <button onClick={() => startEdit(item)}>編輯</button>
                      )}
                      <button onClick={() => toggleActive(item)}>
                        {item.isActive ? "停用" : "啟用"}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )
          )}
          {items.length === 0 && (
            <tr>
              <td colSpan={5}>尚無資料</td>
            </tr>
          )}
        </tbody>
      </table>

      {mode === "editable" && (
        <div className="inline-form">
          <input
            placeholder="業務代碼"
            value={newDraft.code}
            onChange={(e) => setNewDraft((d) => ({ ...d, code: e.target.value }))}
          />
          <input
            placeholder="名稱"
            value={newDraft.name}
            onChange={(e) => setNewDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <input
            type="number"
            placeholder="排序"
            value={newDraft.sortOrder}
            onChange={(e) => setNewDraft((d) => ({ ...d, sortOrder: Number(e.target.value) }))}
          />
          <button onClick={handleCreate}>新增</button>
        </div>
      )}
    </div>
  );
}
