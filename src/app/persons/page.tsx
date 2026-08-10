"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth-client";

type Person = {
  id: string;
  employeeId: string;
  name: string;
  status: "active" | "terminated";
};

// Mirrors ImportClassification in src/lib/persons-import.ts — kept as a local
// type rather than importing it, so this client component never pulls in
// that file's server-only dependencies (prisma) into the browser bundle.
type ImportPreviewItem =
  | {
      kind: "replace";
      personId: string;
      matchedBy: "employeeId" | "name";
      currentEmployeeId: string;
      currentName: string;
      importEmployeeId: string;
      importName: string;
    }
  | {
      kind: "create";
      importEmployeeId: string;
      importName: string;
    }
  | {
      kind: "blocked";
      importEmployeeId: string;
      importName: string;
      reason: string;
    };

type PreviewRow = ImportPreviewItem & { checked: boolean };

export default function PersonsPage() {
  const [persons, setPersons] = useState<Person[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  async function load() {
    const res = await authFetch("/api/persons");
    if (res.ok) setPersons(await res.json());
  }

  useEffect(() => {
    async function fetchData() {
      await load();
    }
    fetchData();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authFetch("/api/persons", {
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

  // T-8 / FR-1: selecting a file immediately calls the preview API (no
  // separate "upload" step) — nothing is written yet (NFR-1).
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file again later
    if (!file) return;

    setImportError(null);
    setImportLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await authFetch("/api/persons/import/preview", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "匯入解析失敗");
      // AC-8: every checkable row starts unchecked.
      setPreview((data as ImportPreviewItem[]).map((item) => ({ ...item, checked: false })));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "匯入解析失敗");
      setPreview(null);
    } finally {
      setImportLoading(false);
    }
  }

  function toggleImportRow(index: number) {
    setPreview((rows) =>
      rows ? rows.map((row, i) => (i === index ? { ...row, checked: !row.checked } : row)) : rows
    );
  }

  // T-9 / AC-9: only rows the user actually checked are sent — the API only
  // ever sees "what to apply", never "everything, filtered by checked".
  async function handleConfirmImport() {
    if (!preview) return;
    const selections = preview
      .filter((row) => row.checked && row.kind !== "blocked")
      .map((row) =>
        row.kind === "replace"
          ? {
              kind: "replace",
              personId: row.personId,
              matchedBy: row.matchedBy,
              importEmployeeId: row.importEmployeeId,
              importName: row.importName,
            }
          : { kind: "create", importEmployeeId: row.importEmployeeId, importName: row.importName }
      );

    setImportError(null);
    setImportLoading(true);
    try {
      const res = await authFetch("/api/persons/import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selections }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "套用失敗");
      setPreview(null);
      await load();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "套用失敗");
    } finally {
      setImportLoading(false);
    }
  }

  // AC-11: closes the preview without calling any API — nothing is written.
  function handleCancelImport() {
    setPreview(null);
    setImportError(null);
  }

  async function handleDelete(employeeId: string) {
    if (!confirm(`確定要將工號 ${employeeId} 設為離職嗎？`)) return;
    const res = await authFetch(`/api/persons/${employeeId}`, { method: "DELETE" });
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

      <div className="inline-form">
        <label>
          匯入 SFT 報表
          <input
            type="file"
            accept=".xls,.xlsx"
            onChange={handleImportFile}
            disabled={importLoading}
          />
        </label>
      </div>

      {importError && <div className="error-box">{importError}</div>}

      {preview && (
        <div>
          <h2>匯入預覽</h2>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>標籤</th>
                <th>現有工號</th>
                <th>現有姓名</th>
                <th>匯入工號</th>
                <th>匯入姓名</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.checked}
                      disabled={row.kind === "blocked"}
                      onChange={() => toggleImportRow(i)}
                    />
                  </td>
                  <td>
                    {row.kind === "replace" ? "取代" : row.kind === "create" ? "新增" : "無法匯入"}
                  </td>
                  <td>{row.kind === "replace" ? row.currentEmployeeId : ""}</td>
                  <td>{row.kind === "replace" ? row.currentName : ""}</td>
                  <td>{row.importEmployeeId}</td>
                  <td>{row.importName}</td>
                  <td>{row.kind === "blocked" ? row.reason : ""}</td>
                </tr>
              ))}
              {preview.length === 0 && (
                <tr>
                  <td colSpan={7}>沒有需要異動的項次</td>
                </tr>
              )}
            </tbody>
          </table>
          <button onClick={handleConfirmImport} disabled={importLoading}>
            確認套用
          </button>
          <button onClick={handleCancelImport} disabled={importLoading}>
            取消
          </button>
        </div>
      )}

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
