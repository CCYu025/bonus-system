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

// 配合度／3S表現／SOP表現的積分規則清單共用同一種形狀（docs/2026-08-06-
// score-rules-lookup-scoring）：三個 API 回傳的欄位名稱各自不同
// （complianceRatingId／threeSPerformanceId／sopPerformanceId），load() 時統一
// 映射成這個形狀，讓 LookupScoreRuleRow 元件能三個章節共用。
type LookupScoreRuleItem = {
  id: string;
  name: string;
  points: number | null;
  isActive: boolean;
  // 配合度沒有鎖定機制，映射時固定為 false；3S表現／SOP表現則帶入各自的 isLocked。
  isLocked: boolean;
};

type ComplianceRatingScoreRuleApiItem = {
  complianceRatingId: string;
  name: string;
  points: number | null;
  isActive: boolean;
};

type ThreeSOrSopScoreRuleApiItem = {
  threeSPerformanceId?: string;
  sopPerformanceId?: string;
  name: string;
  points: number | null;
  isActive: boolean;
  isLocked: boolean;
};

export default function ScoreRulesPage() {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [categoryRules, setCategoryRules] = useState<CategoryScoreRuleItem[]>([]);
  const [overtimeRules, setOvertimeRules] = useState<OvertimeScoreRuleItem[]>([]);
  const [complianceRatingRules, setComplianceRatingRules] = useState<LookupScoreRuleItem[]>([]);
  const [threeSPerformanceRules, setThreeSPerformanceRules] = useState<LookupScoreRuleItem[]>([]);
  const [sopPerformanceRules, setSopPerformanceRules] = useState<LookupScoreRuleItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [categoryRes, overtimeRes, complianceRes, threeSRes, sopRes] = await Promise.all([
      authFetch("/api/category-score-rules"),
      authFetch("/api/overtime-score-rules"),
      authFetch("/api/compliance-rating-score-rules"),
      authFetch("/api/three-s-performance-score-rules"),
      authFetch("/api/sop-performance-score-rules"),
    ]);
    if (categoryRes.ok) setCategoryRules(await categoryRes.json());
    if (overtimeRes.ok) setOvertimeRules(await overtimeRes.json());
    if (complianceRes.ok) {
      const items: ComplianceRatingScoreRuleApiItem[] = await complianceRes.json();
      setComplianceRatingRules(
        items.map((i) => ({
          id: i.complianceRatingId,
          name: i.name,
          points: i.points,
          isActive: i.isActive,
          isLocked: false,
        }))
      );
    }
    if (threeSRes.ok) {
      const items: ThreeSOrSopScoreRuleApiItem[] = await threeSRes.json();
      setThreeSPerformanceRules(
        items.map((i) => ({
          id: i.threeSPerformanceId!,
          name: i.name,
          points: i.points,
          isActive: i.isActive,
          isLocked: i.isLocked,
        }))
      );
    }
    if (sopRes.ok) {
      const items: ThreeSOrSopScoreRuleApiItem[] = await sopRes.json();
      setSopPerformanceRules(
        items.map((i) => ({
          id: i.sopPerformanceId!,
          name: i.name,
          points: i.points,
          isActive: i.isActive,
          isLocked: i.isLocked,
        }))
      );
    }
  }

  useEffect(() => {
    async function fetchData() {
      await load();
    }
    fetchData();
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

  // 配合度／3S表現／SOP表現三個章節共用同一個儲存函式，endpoint 對應各自的
  // API 路徑（/api/{endpoint}/{id}），三者的 PUT 語意完全一致。
  async function saveLookupScoreRule(endpoint: string, id: string, points: number) {
    setError(null);
    const res = await authFetch(`/api/${endpoint}/${id}`, {
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

      <section>
        <h2>配合度</h2>
        <ul className="score-rule-list">
          {complianceRatingRules.map((item) => (
            <LookupScoreRuleRow
              key={item.id}
              item={item}
              editable={mode === "edit"}
              onSave={(id, points) =>
                saveLookupScoreRule("compliance-rating-score-rules", id, points)
              }
            />
          ))}
          {complianceRatingRules.length === 0 && <li>尚無資料</li>}
        </ul>
      </section>

      <section>
        <h2>3S表現</h2>
        <ul className="score-rule-list">
          {threeSPerformanceRules.map((item) => (
            <LookupScoreRuleRow
              key={item.id}
              item={item}
              editable={mode === "edit"}
              onSave={(id, points) =>
                saveLookupScoreRule("three-s-performance-score-rules", id, points)
              }
            />
          ))}
          {threeSPerformanceRules.length === 0 && <li>尚無資料</li>}
        </ul>
      </section>

      <section>
        <h2>SOP表現</h2>
        <ul className="score-rule-list">
          {sopPerformanceRules.map((item) => (
            <LookupScoreRuleRow
              key={item.id}
              item={item}
              editable={mode === "edit"}
              onSave={(id, points) =>
                saveLookupScoreRule("sop-performance-score-rules", id, points)
              }
            />
          ))}
          {sopPerformanceRules.length === 0 && <li>尚無資料</li>}
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

// 配合度／3S表現／SOP表現共用的列元件，三種互斥狀態依優先序判斷：
// 1. isLocked（僅 3S/SOP 的「正常」）→ 不提供積分輸入欄位（AC-2/AC-3）。
// 2. isActive === false → 標示「停用」，積分唯讀不可編輯（AC-7）。
// 3. 其餘 → 沿用出勤類別既有的可編輯／唯讀顯示邏輯（AC-1/AC-9）。
function LookupScoreRuleRow({
  item,
  editable,
  onSave,
}: {
  item: LookupScoreRuleItem;
  editable: boolean;
  onSave: (id: string, points: number) => void;
}) {
  const [draft, setDraft] = useState(String(item.points ?? ""));

  if (item.isLocked) {
    return (
      <li>
        <span>{item.name}</span> — <span className="hint">系統鎖定，不可設定積分</span>
      </li>
    );
  }

  if (!item.isActive) {
    return (
      <li>
        <span>{item.name}</span> <span className="badge">停用</span> —{" "}
        <span>{formatCategoryPoints(item.points)}</span>
      </li>
    );
  }

  if (editable) {
    return (
      <li>
        <span>{item.name}</span>{" "}
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ width: "5em" }}
        />
        <button
          onClick={() => {
            const points = Number(draft);
            if (Number.isInteger(points)) onSave(item.id, points);
          }}
        >
          儲存
        </button>
      </li>
    );
  }

  return (
    <li>
      <span>{item.name}</span> — <span>{formatCategoryPoints(item.points)}</span>
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
