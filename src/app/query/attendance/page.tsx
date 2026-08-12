"use client";

import { useMemo, useState } from "react";
import { authFetch } from "@/lib/auth-client";
import {
  computeCategorySubtotals,
  deriveCategoryOptions,
  derivePersonOptions,
  filterRows,
  type AttendanceQueryRow as Row,
} from "./filters";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function AttendanceQueryPage() {
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [personFilter, setPersonFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authFetch(`/api/attendance-query/by-month?month=${month}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "查詢失敗");
      setRows(data);
      setPersonFilter("");
      setCategoryFilter("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "查詢失敗");
      setRows(null);
    } finally {
      setLoading(false);
    }
  }

  const personOptions = useMemo(() => derivePersonOptions(rows ?? []), [rows]);
  const categoryOptions = useMemo(() => deriveCategoryOptions(rows ?? []), [rows]);

  // T-4 / T-5: 姓名、出勤類別皆為前端即時篩選（下拉單選），不重新呼叫 API。
  const filteredRows = useMemo(
    () => filterRows(rows ?? [], personFilter, categoryFilter),
    [rows, personFilter, categoryFilter]
  );

  // T-6: 類別小計依「目前實際顯示的列」即時重新計算。
  const categorySubtotals = useMemo(() => computeCategorySubtotals(filteredRows), [filteredRows]);

  return (
    <>
      <h2>出勤查詢</h2>
      <p className="hint">僅顯示已核准的正式出勤資料，作廢重審後的舊版本不列入。</p>

      <form className="inline-form" onSubmit={handleSearch}>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          查詢
        </button>
      </form>

      {error && <div className="error-box">{error}</div>}

      {rows && (
        <>
          <div className="inline-form">
            <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
              <option value="">全部姓名</option>
              {personOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">全部類別</option>
              {categoryOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>工號</th>
                  <th>姓名</th>
                  <th>出勤類別</th>
                  <th>實際產量</th>
                  <th>加班時數</th>
                  <th>配合度</th>
                  <th>3S表現</th>
                  <th>SOP表現</th>
                  <th>備註</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={`${r.date}-${r.employeeId}`}>
                    <td>{r.date}</td>
                    <td>{r.employeeId}</td>
                    <td>{r.personName}</td>
                    <td>{r.categoryName ?? "未填"}</td>
                    <td>{r.actualQuantity ?? ""}</td>
                    <td>{r.overtimeHours ?? ""}</td>
                    <td>{r.complianceRatingName ?? ""}</td>
                    {/* AC-9：3S表現/SOP表現項目名稱可能是長篇自由文字（比照
                        forms/[id]/page.tsx AC-13 既有先例），不限寬會讓儲存格
                        自動換行、column 不會真的超寬，.table-scroll 就永遠不會
                        觸發捲動。限寬 + 不換行 + 省略號，過長時以 title 顯示全文。 */}
                    <td
                      style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={r.threeSPerformanceName ?? undefined}
                    >
                      {r.threeSPerformanceName ?? ""}
                    </td>
                    <td
                      style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={r.sopPerformanceName ?? undefined}
                    >
                      {r.sopPerformanceName ?? ""}
                    </td>
                    <td>{r.note ?? ""}</td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={10}>查無資料</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h2>類別小計（依目前篩選結果）</h2>
          <table>
            <thead>
              <tr>
                <th>出勤類別</th>
                <th>筆數</th>
              </tr>
            </thead>
            <tbody>
              {categorySubtotals.map(([name, count]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{count}</td>
                </tr>
              ))}
              {categorySubtotals.length === 0 && (
                <tr>
                  <td colSpan={2}>無資料</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
