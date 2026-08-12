"use client";

import { Fragment, useState } from "react";
import { authFetch } from "@/lib/auth-client";

type ScoreRecordDetail = {
  date: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryPoints: number;
  overtimeHours: number | null;
  overtimePoints: number;
  complianceRatingPoints: number;
  threeSPerformancePoints: number;
  sopPerformancePoints: number;
  subtotal: number;
};

type PersonScoreSummary = {
  employeeId: string;
  personName: string;
  categoryScore: number;
  overtimeScore: number;
  complianceScore: number;
  threeSScore: number;
  sopScore: number;
  totalScore: number;
  records: ScoreRecordDetail[];
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function ScoreQueryPage() {
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<PersonScoreSummary[] | null>(null);
  // T-8：以工號集合記錄目前展開中的人員列，點擊同一列可再收合。
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authFetch(`/api/score-query/by-month?month=${month}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "查詢失敗");
      setRows(data);
      setExpanded(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "查詢失敗");
      setRows(null);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpanded(employeeId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  }

  return (
    <>
      <h2>分數查詢</h2>
      <p className="hint">
        依目前積分規則即時計算，僅計入已核准且未作廢的出勤紀錄；規則異動後，包含過去月份在內的查詢結果都會反映最新規則。
      </p>

      <form className="inline-form" onSubmit={handleSearch}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
        <button type="submit" disabled={loading}>
          查詢
        </button>
      </form>

      {error && <div className="error-box">{error}</div>}

      {rows && (
        <table>
          <thead>
            <tr>
              <th>工號</th>
              <th>姓名</th>
              <th>出勤類別分</th>
              <th>加班分</th>
              <th>配合度分</th>
              <th>3S分</th>
              <th>SOP分</th>
              <th>總分</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isExpanded = expanded.has(r.employeeId);
              return (
                <Fragment key={r.employeeId}>
                  <tr
                    onClick={() => toggleExpanded(r.employeeId)}
                    style={{ cursor: "pointer" }}
                    aria-expanded={isExpanded}
                  >
                    <td>{r.employeeId}</td>
                    <td>{r.personName}</td>
                    <td>{r.categoryScore}</td>
                    <td>{r.overtimeScore}</td>
                    <td>{r.complianceScore}</td>
                    <td>{r.threeSScore}</td>
                    <td>{r.sopScore}</td>
                    <td>{r.totalScore}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={8}>
                        <table>
                          <thead>
                            <tr>
                              <th>日期</th>
                              <th>出勤類別</th>
                              <th>類別分</th>
                              <th>加班時數</th>
                              <th>加班分</th>
                              <th>配合度分</th>
                              <th>3S分</th>
                              <th>SOP分</th>
                              <th>小計</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.records.map((rec) => (
                              <tr key={rec.date}>
                                <td>{rec.date}</td>
                                <td>{rec.categoryName ?? "未填"}</td>
                                <td>{rec.categoryPoints}</td>
                                <td>{rec.overtimeHours ?? ""}</td>
                                <td>{rec.overtimePoints}</td>
                                <td>{rec.complianceRatingPoints}</td>
                                <td>{rec.threeSPerformancePoints}</td>
                                <td>{rec.sopPerformancePoints}</td>
                                <td>{rec.subtotal}</td>
                              </tr>
                            ))}
                            {r.records.length === 0 && (
                              <tr>
                                <td colSpan={9}>本月無出勤紀錄</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8}>查無資料</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}
