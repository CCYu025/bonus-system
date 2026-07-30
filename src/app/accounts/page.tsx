"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth-client";

type Account = {
  id: string;
  username: string;
  role: "developer" | "foreman";
  displayName: string;
  isActive: boolean;
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"developer" | "foreman">("foreman");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  async function load() {
    const res = await authFetch("/api/accounts");
    if (res.ok) setAccounts(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authFetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, displayName, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "建立帳號失敗");
      setUsername("");
      setPassword("");
      setDisplayName("");
      setRole("foreman");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立帳號失敗");
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(acc: Account) {
    const res = await authFetch(`/api/accounts/${acc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !acc.isActive }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "更新失敗");
      return;
    }
    await load();
  }

  async function handleRename(acc: Account) {
    const newName = renameDrafts[acc.id]?.trim();
    if (!newName || newName === acc.displayName) return;
    const res = await authFetch(`/api/accounts/${acc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: newName }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "修改顯示姓名失敗");
      return;
    }
    setRenameDrafts((prev) => {
      const next = { ...prev };
      delete next[acc.id];
      return next;
    });
    await load();
  }

  return (
    <div className="container">
      <h1>帳號管理</h1>
      <p className="hint">
        僅開發者可存取本頁；建立帳號時指定的顯示姓名將用於後續稽核記錄。
      </p>

      {error && <div className="error-box">{error}</div>}

      <form className="inline-form" onSubmit={handleCreate}>
        <input
          placeholder="帳號"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="密碼"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          placeholder="顯示姓名"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "developer" | "foreman")}
        >
          <option value="foreman">班長</option>
          <option value="developer">開發者</option>
        </select>
        <button type="submit" disabled={loading}>
          建立帳號
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>帳號</th>
            <th>角色</th>
            <th>顯示姓名</th>
            <th>狀態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((acc) => (
            <tr key={acc.id}>
              <td>{acc.username}</td>
              <td>{acc.role === "developer" ? "開發者" : "班長"}</td>
              <td>
                <input
                  value={renameDrafts[acc.id] ?? acc.displayName}
                  onChange={(e) =>
                    setRenameDrafts((prev) => ({
                      ...prev,
                      [acc.id]: e.target.value,
                    }))
                  }
                />
              </td>
              <td>{acc.isActive ? "啟用" : "停用"}</td>
              <td>
                <button onClick={() => handleRename(acc)}>更新姓名</button>{" "}
                <button onClick={() => toggleActive(acc)}>
                  {acc.isActive ? "停用" : "啟用"}
                </button>
              </td>
            </tr>
          ))}
          {accounts.length === 0 && (
            <tr>
              <td colSpan={5}>尚無帳號資料</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
