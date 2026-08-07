# 積分規則設定擴充：配合度／3S表現／SOP表現 — 實作計畫

## Traceability Table（AC → Task 對照）

| AC ID | AC 標題 | Task ID(s) |
|-------|---------|-----------|
| AC-1  | 配合度項目可設定積分 | T-1, T-2, T-5 |
| AC-2  | 3S表現「正常」項目不提供積分設定入口 | T-1, T-3, T-5 |
| AC-3  | SOP表現「正常」項目不提供積分設定入口 | T-1, T-4, T-5 |
| AC-4  | 鎖定項目的積分設定在 API 層也被拒絕 | T-1, T-3, T-4 |
| AC-5  | 新增的清單項目即時出現在積分規則設定 | T-1, T-2, T-5 |
| AC-6  | 改名後積分規則設定同步顯示新名稱 | T-1, T-2, T-5 |
| AC-7  | 停用項目在積分規則設定中標示「停用」且唯讀 | T-1, T-2, T-5 |
| AC-8  | 停用項目的積分無法透過 API 被修改 | T-1, T-2 |
| AC-9  | 重新啟用後恢復可編輯且保留原積分 | T-1, T-2, T-5 |
| AC-10 | 月分數查詢納入三項積分 | T-1, T-6 |
| AC-11 | 未設定積分的項目計為 0 分 | T-1, T-6 |

## Tasks

#### T-1：三個查核清單的積分規則資料表 [(infra)]
refs: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11
估時: 1.5h
風險: 低 — 完全比照既有 `category_score_rule` 表的結構與手寫 migration 慣例，無新設計決策。

實作重點：
- `prisma/schema.prisma` 新增三個 model：`ComplianceRatingScoreRule`／`ThreeSPerformanceScoreRule`／`SopPerformanceScoreRule`，欄位與 `CategoryScoreRule` 一致（`id`／`{lookup}Id`（`@unique`）／`points Int`／`updatedBy`／`createdAt`／`updatedAt`），FK 分別指向 `ComplianceRating`／`ThreeSPerformance`／`SopPerformance`。
- 在 `ComplianceRating`／`ThreeSPerformance`／`SopPerformance` 三個 model 上各補一個反向關聯欄位（比照 `AttendanceCategory.categoryScoreRule` 的寫法），否則 Prisma schema 驗證會過不了。
- 新增手寫 SQL migration `prisma/migrations/20260806000000_add_lookup_score_rule_tables/migration.sql`，比照 `20260804000000_add_score_rule_tables/migration.sql` 的風格（`CREATE TABLE` + `CREATE UNIQUE INDEX`），見 `docs/database.md` 的 migration 撰寫慣例，跑 `scripts/migrate.cjs` 驗證可重建 `prisma/test.db`。
- `test/reset-db.ts` 補上三個新表的 `deleteMany()`，順序放在對應 lookup 表（`complianceRating`／`threeSPerformance`／`sopPerformance`）**之前**（FK 子表先清）。務必記得這步——`docs/testing.md` 明確提到漏加會導致第二個測試檔案因 unique constraint 撞號失敗，且錯誤訊息不會直接指向這裡。

AC 摘要：
- AC-1 Then：系統成功儲存該積分值；重新載入頁面後，「跨崗位」顯示剛剛設定的積分，不再顯示「未設定」
- AC-2 Then：「正常」這一列不顯示積分輸入欄位，不可編輯
- AC-3 Then：「正常」這一列不顯示積分輸入欄位，不可編輯
- AC-4 Then：系統回應錯誤，拒絕設定，不寫入任何積分值
- AC-5 Then：重新載入積分規則設定頁面時，「配合度」章節顯示「跨崗位」這一列，積分欄位顯示「未設定」且可編輯
- AC-6 Then：該列顯示名稱為「跨部門支援」，原本設定的 10 分不受影響
- AC-7 Then：積分規則設定頁面的「配合度」章節仍顯示「跨崗位」這一列，標示「停用」，積分欄位顯示 10 分但沒有輸入框或儲存按鈕
- AC-8 Then：系統回應錯誤，拒絕變更，原本的 10 分維持不變
- AC-9 Then：積分規則設定頁面該列恢復可編輯，積分欄位顯示先前設定的 10 分，不需重新輸入
- AC-10 Then：該筆紀錄的配合度積分計為 10 分、3S表現積分計為 5 分、SOP表現積分計為 0 分，三者皆併入該人員的月總分
- AC-11 Then：該筆紀錄的 3S表現積分計為 0 分

---

#### T-2：配合度積分規則（lib + API）
refs: AC-1, AC-5, AC-6, AC-7, AC-8, AC-9
估時: 3h
風險: 中 — `listComplianceRatingScoreRules` 必須**包含停用項目**（AC-7），這點跟可直接複製貼上的 `listCategoryScoreRules`（排除停用）行為相反，複製時容易漏改，需在測試中明確斷言涵蓋停用項目。

實作重點：
- 新增 `src/lib/compliance-rating-score-rules.ts`，結構比照 `src/lib/category-score-rules.ts`：
  - `listComplianceRatingScoreRules()`：查 `prisma.complianceRating.findMany()`（**不加 `isActive: true` 過濾**，AC-7 要求停用項目仍顯示），`orderBy: sortOrder`，`include: { complianceRatingScoreRule: true }`，回傳 `{ complianceRatingId, name, points, isActive, updatedAt, updatedBy }[]`（未設定規則的 `points` 回傳 `null`，比照 AC-3 既有邏輯，不得推導成 0）。
  - `upsertComplianceRatingScoreRule(id, points, updatedBy)`：guard 順序—找不到項目 → 404；`isActive === false` → 400「已停用的項目不可設定積分」（AC-8）；`points` 非整數 → 400；其餘走 `upsert`（`where: { complianceRatingId: id }`）。
- 新增路由 `src/app/api/compliance-rating-score-rules/route.ts`（GET，`requireRole("developer")`，比照 `category-score-rules/route.ts` 連唯讀查詢都限定 developer，見該檔案註解）與 `src/app/api/compliance-rating-score-rules/[id]/route.ts`（PUT，同權限）。
- 測試：`compliance-rating-score-rules.test.ts`（DB-backed，比照 `category-score-rules.test.ts` 的 fixture 風格）覆蓋：未設定回傳 `null`（AC-1 前置）、設定後回傳新值（AC-1）、新建項目立即出現在 list（AC-5）、改名後 list 顯示新名稱且積分不變（AC-6）、停用項目仍出現在 list 且 `isActive: false`（AC-7 資料面）、對停用項目呼叫 upsert 被拒且原值不變（AC-8）、重新啟用後 `isActive: true` 且 `points` 保留（AC-9）。這些全是 AC 的資料/API 行為斷言，不需要元件測試（畫面渲染由 T-5 負責）。

AC 摘要：
- AC-1 Then：系統成功儲存該積分值；重新載入頁面後，「跨崗位」顯示剛剛設定的積分，不再顯示「未設定」
- AC-5 Then：重新載入積分規則設定頁面時，「配合度」章節顯示「跨崗位」這一列，積分欄位顯示「未設定」且可編輯
- AC-6 Then：該列顯示名稱為「跨部門支援」，原本設定的 10 分不受影響
- AC-7 Then：積分規則設定頁面的「配合度」章節仍顯示「跨崗位」這一列，標示「停用」，積分欄位顯示 10 分但沒有輸入框或儲存按鈕
- AC-8 Then：系統回應錯誤，拒絕變更，原本的 10 分維持不變
- AC-9 Then：積分規則設定頁面該列恢復可編輯，積分欄位顯示先前設定的 10 分，不需重新輸入

---

#### T-3：3S表現積分規則（lib + API，含鎖定 guard）
refs: AC-2, AC-4
估時: 2.5h
風險: 中 — guard 順序需同時處理 `isLocked` 與 `isActive` 兩種唯讀狀態，兩者訊息與狀態碼容易混淆（見 `src/lib/three-s-performance.ts` 既有的 `isLocked` 拒絕寫法可直接參考）。

實作重點：
- 新增 `src/lib/three-s-performance-score-rules.ts`：
  - `listThreeSPerformanceScoreRules()`：查 `prisma.threeSPerformance.findMany()`（不過濾 `isActive`），回傳額外帶 `isLocked` 欄位（`{ threeSPerformanceId, name, points, isActive, isLocked, updatedAt, updatedBy }[]`），供前端判斷「正常」項目不可設定（AC-2）。
  - `upsertThreeSPerformanceScoreRule(id, points, updatedBy)`：guard 順序—找不到 → 404；`isLocked` → 400/403「『正常』為系統鎖定選項，不可設定積分」（AC-4，比照 `three-s-performance.ts` 既有的鎖定拒絕語氣）；`isActive === false` → 400；`points` 非整數 → 400；否則 upsert。
- 新增路由 `src/app/api/three-s-performance-score-rules/route.ts`（GET）與 `[id]/route.ts`（PUT），權限比照 T-2。
- 測試：`three-s-performance-score-rules.test.ts` 覆蓋：`isLocked` 項目呼叫 upsert 被拒、不寫入任何值（AC-4 資料面）；list 回傳的 `isLocked` 欄位值正確，供 T-5 的元件測試判斷渲染。AC-4 的 Then（「系統回應錯誤，拒絕設定，不寫入任何積分值」）是純 API 行為，此處為 data/API 測試，不需要元件測試；AC-2 的「不顯示輸入欄位」則留給 T-5 的元件測試驗證（見下方測試層級判斷）。

AC 摘要：
- AC-2 Then：「正常」這一列不顯示積分輸入欄位，不可編輯
- AC-4 Then：系統回應錯誤，拒絕設定，不寫入任何積分值

---

#### T-4：SOP表現積分規則（lib + API，含鎖定 guard）
refs: AC-3, AC-4
估時: 2.5h
風險: 中 — 與 T-3 相同的 guard 排序風險（`isLocked` 與 `isActive` 需分開判斷、訊息一致）；建議 T-3 完成後直接比照複製，降低風險。

實作重點：
- 新增 `src/lib/sop-performance-score-rules.ts`，結構、guard 順序、`isLocked`/`isActive` 處理與 T-3 的 `three-s-performance-score-rules.ts` 完全對稱（比照 `sop-performance.ts` 既有的 `isLocked` 拒絕寫法）。
- 新增路由 `src/app/api/sop-performance-score-rules/route.ts`（GET）與 `[id]/route.ts`（PUT）。
- 測試：`sop-performance-score-rules.test.ts` 結構對稱 T-3，涵蓋 AC-4 對 SOP 表現鎖定項目的拒絕（與 T-3 的 3S 表現案例互為 AC-4 的兩個具體場景）。

AC 摘要：
- AC-3 Then：「正常」這一列不顯示積分輸入欄位，不可編輯
- AC-4 Then：系統回應錯誤，拒絕設定，不寫入任何積分值

---

#### T-5：積分規則設定頁面新增三個章節 [(infra)]
refs: AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-9
估時: 4h
風險: 中 — 同一列會有「可編輯／鎖定唯讀／停用唯讀」三種互斥狀態，容易在條件分支寫錯導致某個狀態誤顯示輸入框（尤其鎖定與停用的判斷優先序）。三個章節共用同一元件，屬於單一頁面內的共用邏輯，故標為 infra。

實作重點：
- 在 `src/app/score-rules/page.tsx` 依 spec Q2 順序（出勤類別 → 加班 → 配合度 → 3S表現 → SOP表現）新增三個 `<section>`，分別呼叫 T-2/T-3/T-4 的三個 GET API（併入既有 `Promise.all(load())`）。
- 新增一個共用 row 元件（例如 `LookupScoreRuleRow`，可放在 `page.tsx` 內或抽成同目錄下 `lookup-score-rule-row.tsx`）取代針對三個章節各寫一份的重複程式碼——這點跟 spec Out of scope 提到「是否抽共用元件留待 plan 決定」不同：那條講的是**類別管理的 CRUD 元件**（`lookup-list-panel.tsx`，本次不動），這裡是全新的「積分規則設定 row」，三個章節資料形狀完全一致（`{id, name, points, isActive, isLocked?}`），同檔案內共用不引入跨模組耦合，風險低、值得做。渲染邏輯優先序：`isLocked`（3S/SOP 專用）→ 不顯示輸入框，顯示「系統鎖定，不可設定積分」提示（AC-2/AC-3）；否則 `isActive === false` → 顯示「停用」標籤 + 唯讀積分值，無 input/button（AC-7）；否則（`isActive === true` 且未鎖定）→ 沿用 `mode === "edit"` 時顯示 input + 儲存按鈕，唯讀模式顯示 `formatCategoryPoints` 格式化後的值（AC-1/AC-9，重新啟用後這個分支會自然命中，不需要額外程式碼）。
- 配合度清單沒有 `isLocked` 欄位（`undefined` 視為 falsy），比照 `lookup-list-panel.tsx` 既有處理方式。

**測試層級判斷**：
- AC-1／AC-5／AC-6／AC-9 的 Then 子句描述的是「儲存後的值」「新項目出現」「改名後顯示新名稱」「保留原積分」——都是「給定這筆資料，欄位顯示什麼值」，本質是資料/顯示對應，已由 T-2 的 lib 測試覆蓋資料正確性；這裡只需確保沿用既有 `mode === "edit"` 分支渲染 input，不需要額外新增元件測試。
- AC-2／AC-3／AC-7 的 Then 子句描述「該列**不顯示**輸入框／儲存按鈕」——這是「元素是否存在」的判斷，純字串格式化測試驗不到，需要新增 component test（Vitest + React Testing Library，jsdom 環境），比照 `src/app/score-rules/page.test.tsx` 現有對假日加班列（AC-4，舊 spec）「no input/button」的測試寫法：mock `authFetch` 回傳含鎖定/停用項目的假資料，斷言對應 `<li>`／`<tr>` 內 `querySelector("input")`／`querySelector("button")` 為 `null`。此專案已具備 `@testing-library/react` + jsdom 環境（`test/jsdom-setup.ts`），不需要額外建置。
- 三條 AC 都不涉及真實排版／捲動／跨頁流程，不需要 Playwright；此專案目前也沒有 `playwright.config.ts`。

AC 摘要：
- AC-1 Then：系統成功儲存該積分值；重新載入頁面後，「跨崗位」顯示剛剛設定的積分，不再顯示「未設定」
- AC-2 Then：「正常」這一列不顯示積分輸入欄位，不可編輯
- AC-3 Then：「正常」這一列不顯示積分輸入欄位，不可編輯
- AC-5 Then：重新載入積分規則設定頁面時，「配合度」章節顯示「跨崗位」這一列，積分欄位顯示「未設定」且可編輯
- AC-6 Then：該列顯示名稱為「跨部門支援」，原本設定的 10 分不受影響
- AC-7 Then：積分規則設定頁面的「配合度」章節仍顯示「跨崗位」這一列，標示「停用」，積分欄位顯示 10 分但沒有輸入框或儲存按鈕
- AC-9 Then：積分規則設定頁面該列恢復可編輯，積分欄位顯示先前設定的 10 分，不需重新輸入

---

#### T-6：月分數查詢納入三項積分
refs: AC-10, AC-11
估時: 3h
風險: 中 — 修改的是既有 `queryScoresByMonth` 的核心彙總邏輯，錯誤會直接影響現行出勤類別／加班分數的既有測試（`score-query.test.ts` 既有案例），需確保既有測試全數維持通過。

實作重點：
- `src/lib/score-query.ts`：
  - `Promise.all` 內新增三個查詢：`prisma.complianceRatingScoreRule.findMany()`／`prisma.threeSPerformanceScoreRule.findMany()`／`prisma.sopPerformanceScoreRule.findMany()`，各自建成 `Map<lookupId, points>`，比照現有 `categoryPointsMap` 的寫法。
  - 新增三個 `xxxPointsFor(id: string | null): number` 函式，邏輯與 `categoryPointsFor` 一致：`id === null` 或查無規則 → 回傳 0（同時滿足 AC-10 的「SOP表現欄位未填寫→0分」與 AC-11 的「未設定積分→0分」，兩者是同一段邏輯的不同觸發條件，不必分開處理）。
  - `PersonScoreSummary` 新增 `complianceScore`／`threeSScore`／`sopScore` 三個欄位；`ScoreRecordDetail` 新增對應的 `complianceRatingPoints`／`threeSPerformancePoints`／`sopPerformancePoints`；逐筆計分迴圈內累加進這三個新分數與既有 `subtotal`／`totalScore`（`totalScore` 現為五項之和：類別分＋加班分＋配合度分＋3S分＋SOP分）。
  - 逐筆計分讀取 `record.complianceRatingId`／`record.threeSPerformanceId`／`record.sopPerformanceId`（`AttendanceRecord` 既有欄位，見 `prisma/schema.prisma`），不需要額外 `include`。
- 附帶更新 `src/app/score-query/page.tsx` 表格，新增三欄顯示配合度分／3S分／SOP分（非 AC 硬性要求——AC-10/11 的 Then 只描述分數計算結果，不是畫面呈現，但既有 `categoryScore`/`overtimeScore` 都有對應欄位，若不同步會讓這次新分數在畫面上「有算但看不到」，故一併補上，維持功能完整性；这属于 UI 呈现已有资料的部分，不新增测试义务）。
- 測試：`score-query.test.ts` 新增案例對齊 AC-10（同一筆紀錄三個欄位皆有值/部分未填，驗證 `complianceScore`/`threeSScore`/`sopScore`/`totalScore` 皆正確加總）與 AC-11（3S表現項目存在但未設定積分，計為 0 分）。這是資料/API 行為，沿用既有 DB-backed `lib/*.test.ts` 慣例，不需要元件測試；若同步更新了 `score-query/page.tsx` 顯示欄位，可选择性在既有 `score-query/page.test.tsx` 补一个欄位存在的 smoke assertion，但非本次 AC 要求。

AC 摘要：
- AC-10 Then：該筆紀錄的配合度積分計為 10 分、3S表現積分計為 5 分、SOP表現積分計為 0 分（因未填寫），三者皆併入該人員的月總分
- AC-11 Then：該筆紀錄的 3S表現積分計為 0 分

## 執行順序

1. T-1（DB schema，所有後續 task 的前提）
2. T-2（配合度 lib + API）——作為 T-3/T-4 複製的參考實作
3. T-3（3S表現 lib + API）、T-4（SOP表現 lib + API）——可與 T-6 並行，兩者互相獨立
4. T-6（score-query 彙總邏輯）——只依賴 T-1 的 schema，不依賴 T-2/T-3/T-4，可提前或並行進行
5. T-5（前端頁面三章節）——需等 T-2/T-3/T-4 的 API 完成才能串接，放在最後

## 技術決策記錄

1. **三個查核清單的積分規則 lib／API 不抽共用模組，各自獨立成檔**：延續本專案既有慣例——`compliance-ratings.ts`／`three-s-performance.ts`／`sop-performance.ts` 三份清單本身的 CRUD 就已經是刻意維持的近乎重複程式碼（未抽共用），而不是這三份清單的「積分規則」子功能才決定要不要抽。理由同樣是三者的鎖定/停用規則有微妙差異（配合度沒有 `isLocked`），共用模組需要用參數/泛型硬湊反而降低可讀性，不符合本專案目前的規模。
2. **積分規則的 GET 端點沿用 `category-score-rules` 的既有先例，一律限定 `developer` 角色**（即使唯讀查詢）：spec 的 NFR-1 字面僅要求「設定／修改」限定 developer，但既有 `category-score-rules/route.ts` 已將唯讀 GET 一併限定，為維持同一頁面（`/score-rules`）底下所有資料來源的權限一致性，新端點比照辦理，避免同一頁面內出現权限深浅不一的 API。
3. **`listXxxScoreRules()` 不比照 `listCategoryScoreRules()` 排除停用項目**：`CategoryScoreRule` 的既有設計是「停用類別直接從清單消失」（spec Out of scope 明確說本次不改這個既有行為），但本次三個新清單的 AC-7 明確要求停用項目仍要顯示並標示「停用」，因此三個新 list 函式故意不套用 `isActive: true` 過濾，這是兩種清單各自因應不同 AC 而分岐的正常結果，不是不一致的錯誤。

## 測試層級判斷（總覽）

| 分類 | 對應 AC | 測試層級 |
|------|---------|---------|
| 資料/API 行為（值計算、儲存、guard 拒絕） | AC-1, AC-4, AC-5, AC-6, AC-8, AC-9, AC-10, AC-11 | 既有 pytest-equivalent（Vitest + 真實 SQLite，`lib/*.test.ts`） |
| UI 元素是否渲染（無 input/button） | AC-2, AC-3, AC-7 | Component test（Vitest + React Testing Library + jsdom，比照 `score-rules/page.test.tsx` 既有寫法） |
| 真實排版/捲動/跨頁流程 | 無 | 不適用——本次無此類 AC，且專案目前無 Playwright 環境 |
