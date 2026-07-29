"use client";

import { useEffect, useState } from "react";

type Person = {
  id: string;
  employeeId: string;
  name: string;
  status: "active" | "terminated";
};

export default function PersonsPage() {
  const [persons, setPersons] = useState<Person[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/persons");
    setPersons(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/persons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "新增失敗");
      setEmployeeId("");
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(employeeId: string) {
    if (!confirm(`確定要將工號 ${employeeId} 設為離職嗎？`)) return;
    const res = await fetch(`/api/persons/${employeeId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "刪除失敗");
      return;
    }
    await load();
  }

  return (
    <div className="container">
      <h1>人員主檔管理</h1>

      {error && <div className="error-box">{error}</div>}

      <form className="inline-form" onSubmit={handleCreate}>
        <input
          placeholder="工號"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          required
        />
        <input
          placeholder="姓名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          新增人員
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>工號</th>
            <th>姓名</th>
            <th>狀態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {persons.map((p) => (
            <tr key={p.id}>
              <td>{p.employeeId}</td>
              <td>{p.name}</td>
              <td>{p.status === "active" ? "在職" : "離職"}</td>
              <td>
                {p.status === "active" && (
                  <button onClick={() => handleDelete(p.employeeId)}>
                    設為離職
                  </button>
                )}
              </td>
            </tr>
          ))}
          {persons.length === 0 && (
            <tr>
              <td colSpan={4}>尚無人員資料</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
