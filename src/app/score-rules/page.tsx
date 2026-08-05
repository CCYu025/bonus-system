"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth-client";
import { formatCategoryPoints, formatOvertimeRuleLabel } from "./display";

type CategoryScoreRuleItem = {
  categoryId: string;
  categoryName: string;
  points: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
  scoreSource: "category" | "overtime";
};

type OvertimeScoreRuleItem = {
  id: string;
  overtimeType: "weekday" | "holiday";
  minHours: number;
  maxHours: number | null;
  points: number;
  pointsPerExtraHour: number | null;
  sortOrder: number;
};

export default function ScoreRulesPage() {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [categoryRules, setCategoryRules] = useState<CategoryScoreRuleItem[]>([]);
  const [overtimeRules, setOvertimeRules] = useState<OvertimeScoreRuleItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [categoryRes, overtimeRes] = await Promise.all([
      authFetch("/api/category-score-rules"),
      authFetch("/api/overtime-score-rules"),
    ]);
    if (categoryRes.ok) setCategoryRules(await categoryRes.json());
    if (overtimeRes.ok) setOvertimeRules(await overtimeRes.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function saveCategoryPoints(categoryId: string, points: number) {
    setError(null);
    const res = await authFetch(`/api/category-score-rules/${categoryId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "儲存失敗");
      return;
    }
    await load();
  }

  async function saveOvertimeRule(
    id: string,
    points: number,
    pointsPerExtraHour: number | null
  ) {
    setError(null);
    const res = await authFetch(`/api/overtime-score-rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points, pointsPerExtraHour }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "儲存失敗");
      return;
    }
    await load();
  }

  const weekdayRules = overtimeRules.filter((r) => r.overtimeType === "weekday");
  const holidayRules = overtimeRules.filter((r) => r.overtimeType === "holiday");

  return (
    <div className="container">
      <h1>積分規則設定</h1>
      <p className="hint">
        本頁僅設定各考核項目的積分值，不涉及依出勤紀錄實際計算或彙總積分。
      </p>

      {error && <div className="error-box">{error}</div>}

      <div className="inline-form">
        <button onClick={() => setMode(mode === "view" ? "edit" : "view")}>
          {mode === "view" ? "切換為編輯模式" : "切換為唯讀檢視"}
        </button>
      </div>

      <section>
        <h2>出勤類別</h2>
        <ul className="score-rule-list">
          {categoryRules.map((item) => (
            <CategoryRuleRow
              key={item.categoryId}
              item={item}
              editable={mode === "edit"}
              onSave={saveCategoryPoints}
            />
          ))}
          {categoryRules.length === 0 && <li>尚無資料</li>}
        </ul>
      </section>

      <section>
        <h2>加班</h2>

        <h3>平日加班</h3>
        <ul className="score-rule-list">
          {weekdayRules.map((rule) => (
            <OvertimeRuleRow
              key={rule.id}
              rule={rule}
              editable={mode === "edit"}
              onSave={saveOvertimeRule}
            />
          ))}
          {weekdayRules.length === 0 && <li>尚無資料</li>}
        </ul>

        <h3>假日加班</h3>
        <p className="hint">
          此積分僅在出勤類別為假日加班，且加班時數達到對應門檻時才成立；本頁僅設定規則本身，不做任何實際判斷或計算。
        </p>
        <ul className="score-rule-list">
          {holidayRules.map((rule) => (
            <OvertimeRuleRow
              key={rule.id}
              rule={rule}
              editable={mode === "edit"}
              onSave={saveOvertimeRule}
            />
          ))}
          {holidayRules.length === 0 && <li>尚無資料</li>}
        </ul>
      </section>
    </div>
  );
}

function CategoryRuleRow({
  item,
  editable,
  onSave,
}: {
  item: CategoryScoreRuleItem;
  editable: boolean;
  onSave: (categoryId: string, points: number) => void;
}) {
  const [draft, setDraft] = useState(String(item.points ?? ""));

  // AC-4：假日加班不提供積分輸入欄位，改顯示固定提示文字，且無法透過此章節設定固定積分值。
  if (item.scoreSource === "overtime") {
    return (
      <li>
        <span>{item.categoryName}</span> — <span className="hint">積分由加班規則決定</span>
      </li>
    );
  }

  if (editable) {
    return (
      <li>
        <span>{item.categoryName}</span>{" "}
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ width: "5em" }}
        />
        <button
          onClick={() => {
            const points = Number(draft);
            if (Number.isInteger(points)) onSave(item.categoryId, points);
          }}
        >
          儲存
        </button>
      </li>
    );
  }

  return (
    <li>
      <span>{item.categoryName}</span> — <span>{formatCategoryPoints(item.points)}</span>
    </li>
  );
}

function OvertimeRuleRow({
  rule,
  editable,
  onSave,
}: {
  rule: OvertimeScoreRuleItem;
  editable: boolean;
  onSave: (id: string, points: number, pointsPerExtraHour: number | null) => void;
}) {
  const [pointsDraft, setPointsDraft] = useState(String(rule.points));
  const [perHourDraft, setPerHourDraft] = useState(
    rule.pointsPerExtraHour === null ? "" : String(rule.pointsPerExtraHour)
  );

  if (editable) {
    return (
      <li>
        <input
          type="number"
          value={pointsDraft}
          onChange={(e) => setPointsDraft(e.target.value)}
          style={{ width: "5em" }}
        />
        {rule.pointsPerExtraHour !== null && (
          <>
            {" ＋ 每小時 "}
            <input
              type="number"
              value={perHourDraft}
              onChange={(e) => setPerHourDraft(e.target.value)}
              style={{ width: "5em" }}
            />
          </>
        )}
        <button
          onClick={() => {
            const points = Number(pointsDraft);
            const pointsPerExtraHour =
              rule.pointsPerExtraHour === null ? null : Number(perHourDraft);
            if (
              Number.isInteger(points) &&
              (pointsPerExtraHour === null || Number.isInteger(pointsPerExtraHour))
            ) {
              onSave(rule.id, points, pointsPerExtraHour);
            }
          }}
        >
          儲存
        </button>
      </li>
    );
  }

  return <li>{formatOvertimeRuleLabel(rule)}</li>;
}
