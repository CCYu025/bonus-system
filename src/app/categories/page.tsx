"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth-client";

type Category = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);

  async function load() {
    const res = await authFetch("/api/categories");
    if (res.ok) setCategories(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(cat: Category) {
    const res = await authFetch(`/api/categories/${cat.id}`, {
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
      <h1>出勤類別字典</h1>
      <p className="hint">
        出勤類別為固定設定，如需新增或修改請聯繫系統維護人員調整設定；此畫面僅能停用／啟用既有類別，停用不影響既有出勤紀錄的類別對應。
      </p>

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
