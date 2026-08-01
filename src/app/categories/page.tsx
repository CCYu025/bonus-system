"use client";

import { useState } from "react";
import LookupListPanel from "./lookup-list-panel";

const TABS = [
  {
    key: "category",
    label: "出勤類別",
    apiBase: "/api/categories",
    mode: "readonly" as const,
  },
  {
    key: "compliance",
    label: "配合度",
    apiBase: "/api/compliance-ratings",
    mode: "editable" as const,
  },
  {
    key: "three-s",
    label: "3S表現",
    apiBase: "/api/three-s-performance",
    mode: "editable" as const,
  },
];

export default function CategoriesPage() {
  const [activeKey, setActiveKey] = useState(TABS[0].key);
  const current = TABS.find((t) => t.key === activeKey) ?? TABS[0];

  return (
    <div className="container">
      <h1>類別管理</h1>
      <div className="inline-form">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveKey(t.key)}
            disabled={t.key === activeKey}
          >
            {t.label}
          </button>
        ))}
      </div>

      {current.mode === "readonly" && (
        <p className="hint">
          出勤類別為固定設定，如需新增或修改請聯繫系統維護人員調整設定；此畫面僅能停用／啟用既有類別，停用不影響既有出勤紀錄的類別對應。
        </p>
      )}

      <LookupListPanel key={current.apiBase} apiBase={current.apiBase} mode={current.mode} />
    </div>
  );
}
