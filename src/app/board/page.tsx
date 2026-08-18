"use client";

import { useEffect, useState } from "react";
import type { PersonScoreSummary } from "@/lib/score-query";
import { useIsNarrowScreen } from "./use-is-narrow-screen";
import { SCORE_CATEGORIES } from "./score-colors";
import StackedBarChart from "./stacked-bar-chart";
import PersonModal from "./person-modal";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function BoardPage() {
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<PersonScoreSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const isNarrow = useIsNarrowScreen();

  useEffect(() => {
    async function load() {
      setError(null);
      try {
        const res = await fetch(`/api/public/score-board/by-month?month=${month}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "查詢失敗");
        setRows(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "查詢失敗");
        setRows(null);
      }
    }
    load();
  }, [month]);

  const selected = selectedIndex !== null && rows ? rows[selectedIndex] : null;

  return (
    <div className="container">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <h1>積分排行榜</h1>
        <label className="month-select">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="選擇月份"
          />
        </label>
      </div>

      {error && <div className="error-box">{error}</div>}

      {rows && rows.length === 0 && <p className="hint">該月份尚無資料</p>}

      {rows && rows.length > 0 && (
        <>
          <StackedBarChart rows={rows} />

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>排名</th>
                  <th>姓名</th>
                  {!isNarrow && <th>工號</th>}
                  {!isNarrow &&
                    SCORE_CATEGORIES.map((c) => <th key={c.key}>{c.label}</th>)}
                  <th>總分</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.employeeId}
                    onClick={() => setSelectedIndex(i)}
                    style={{ cursor: "pointer", minHeight: "44px" }}
                  >
                    <td>{i + 1}</td>
                    <td>{r.personName}</td>
                    {!isNarrow && <td>{r.employeeId}</td>}
                    {!isNarrow &&
                      SCORE_CATEGORIES.map((c) => <td key={c.key}>{r[c.key]}</td>)}
                    <td>{r.totalScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selected && selectedIndex !== null && (
        <PersonModal
          summary={selected}
          rank={selectedIndex + 1}
          total={rows?.length ?? 0}
          isNarrow={isNarrow}
          onClose={() => setSelectedIndex(null)}
        />
      )}
    </div>
  );
}
