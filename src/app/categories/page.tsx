"use client";

import { useEffect, useState } from "react";

type Category = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/categories");
    setCategories(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, sortOrder: Number(sortOrder) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "新增失敗");
      setCode("");
      setName("");
      setSortOrder("0");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增失敗");
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(cat: Category) {
    const res = await fetch(`/api/categories/${cat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !cat.isActive }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "更新失敗");
      return;
    }
    await load();
  }

  return (
    <div className="container">
      <h1>出勤類別字典維護</h1>
      <p className="hint">
        新增類別後立即出現於出勤登記表單下拉選單；停用不影響既有出勤紀錄的類別對應。
      </p>

      {error && <div className="error-box">{error}</div>}

      <form className="inline-form" onSubmit={handleCreate}>
        <input
          placeholder="業務代碼"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <input
          placeholder="名稱"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          placeholder="排序"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          新增類別
        </button>
      </form>

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
          {categories.map((c) => (
            <tr key={c.id}>
              <td>{c.code}</td>
              <td>{c.name}</td>
              <td>{c.sortOrder}</td>
              <td>{c.isActive ? "啟用" : "停用"}</td>
              <td>
                <button onClick={() => toggleActive(c)}>
                  {c.isActive ? "停用" : "啟用"}
                </button>
              </td>
            </tr>
          ))}
          {categories.length === 0 && (
            <tr>
              <td colSpan={5}>尚無出勤類別</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
