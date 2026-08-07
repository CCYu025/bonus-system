依據 spec：`docs/2026-08-07-attendance-query-extended-fields/spec.md`（AC-1 ~ AC-9、NFR-1，已確認）

既有架構參考：
- `docs/testing.md`（Vitest + 真實 SQLite test DB、`resetDb()` 慣例；`score-rules`/`score-query` 已建立的 jsdom + React Testing Library component test 慣例，`// @vitest-environment jsdom` + mock `authFetch`）
- 程式碼：
  - `src/lib/attendance-query.ts`（本次擴充的查詢函式，第 7-14 行 `AttendanceQueryRow` 型別、第 33-41 行 Prisma `include`、第 48-57 行欄位映射）
  - `src/app/attendance-query/page.tsx`（本次擴充的頁面表格，第 96-122 行）
  - `src/app/attendance-query/filters.ts`（獨立定義的同名 `AttendanceQueryRow` 型別，第 1-8 行；`computeCategorySubtotals` 第 48-55 行只依 `categoryName` 分組）
  - `src/app/forms/[id]/page.tsx`（比照的欄位顯示慣例：實際產量/加班時數 `?? ""`，配合度/3S表現/SOP表現 `?.name ?? ""` 皆已在唯讀分支簡化為直接讀已解析好的欄位；第 402-548 行）
  - `src/app/globals.css` 第 92-95 行：`.table-scroll { overflow-x: auto; }` 已存在，`forms/[id]/page.tsx` 已有先例（第 358 行 `<div className="table-scroll">`）
  - `prisma/schema.prisma` 第 256-299 行 `AttendanceRecord` model：`actualQuantity`、`overtimeHours`、`complianceRatingId`/`complianceRating`、`threeSPerformanceId`/`threeSPerformance`、`sopPerformanceId`/`sopPerformance` 五個既有欄位/關聯，本次不新增 schema。

## Traceability Table（AC → Task 對照）

| AC ID | AC 標題 | Task ID(s) |
|-------|---------|-----------|
| AC-1 | 查詢結果顯示已填寫的實際產量 | T-1, T-2 |
| AC-2 | 查詢結果顯示已填寫的加班時數 | T-1, T-2 |
| AC-3 | 查詢結果顯示已設定的配合度 | T-1, T-2 |
| AC-4 | 查詢結果顯示已設定的3S表現 | T-1, T-2 |
| AC-5 | 查詢結果顯示已設定的SOP表現 | T-1, T-2 |
| AC-6 | 未填的擴充欄位顯示空白 | T-1, T-2 |
| AC-7 | 因出勤類別鎖定而被清空的擴充欄位視同未填 | T-1, T-2 |
| AC-8 | 類別小計不受新增欄位影響 | T-3 |
| AC-9 | 欄位增加後表格可橫向捲動 | T-4 |
| NFR-1 | 新增欄位不得引入 N+1 查詢問題 | T-1 |

---

## Tasks

#### T-1：查詢層擴充——回傳五個擴充欄位（含關聯 include） (infra)
refs: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, NFR-1
估時: 3 小時
風險: 低 — 完全比照現有 `person`/`category` 的 `include` 寫法，新增三個關聯 include，屬同一套既有模式的延伸，無新技術。

實作重點：
- `src/lib/attendance-query.ts`：
  - `AttendanceQueryRow` 型別新增 `actualQuantity: number | null`、`overtimeHours: number | null`、`complianceRatingName: string | null`、`threeSPerformanceName: string | null`、`sopPerformanceName: string | null`。**不**新增 `complianceRatingId`/`threeSPerformanceId`/`sopPerformanceId`（見「技術決策記錄」第 1 項）。
  - `prisma.attendanceForm.findMany` 的 `records.include` 從 `{ person: true, category: true }` 擴充為 `{ person: true, category: true, complianceRating: true, threeSPerformance: true, sopPerformance: true }`，隨主查詢一次撈取，滿足 NFR-1。
  - `flatMap` 內的欄位映射新增：`actualQuantity: r.actualQuantity`、`overtimeHours: r.overtimeHours`、`complianceRatingName: r.complianceRating?.name ?? null`、`threeSPerformanceName: r.threeSPerformance?.name ?? null`、`sopPerformanceName: r.sopPerformance?.name ?? null`——直接透傳 Prisma 讀到的值，不在這層做任何 `?? ""` 顯示轉換（顯示層的空字串 fallback屬於 T-2 的頁面渲染責任，維持資料層/顯示層職責分離）。
  - 既有三層過濾邏輯（`status="approved"` + `activeDateKey` 非 null + `isFilledRecord`）不變動（Scope 明確排除）。
- 這是「AC 描述資料/API 行為」，沿用既有 pytest 慣例，於 `src/lib/attendance-query.test.ts` 新增案例：
  - AC-1／AC-2：`saveFormRecords` 寫入 `actualQuantity`/`overtimeHours` 各自的合法值，查詢結果對應欄位等於寫入值。
  - AC-3／AC-4／AC-5：分別建立 `complianceRating`/`threeSPerformance`/`sopPerformance` 選項並寫入對應 id，查詢結果對應 `*Name` 欄位等於該選項的 `name`。
  - AC-6：以既有 `seedApprovedForm` 模式建立一筆 `categoryId` 已填、其餘五個擴充欄位皆未指定（維持 Prisma 預設 `null`）的紀錄，斷言五個欄位皆為 `null`。
  - AC-7：建立一筆 `locksExtendedFields: true` 的類別（沿用 `docs/2026-08-03-attendance-leave-lock-sop-field` 既有的 `saveFormRecords` 強制清空邏輯，本次不修改該邏輯，只驗證查詢層正確透傳），對該類別寫入本應清空的擴充欄位值，斷言查詢結果五個欄位皆為 `null`——與 AC-6 使用同一組斷言方式，差別只在於資料成因（見「技術決策記錄」第 2 項）。
  - NFR-1：以 `verification_method: static_review` 佐證，非執行期測試——確認整段查詢只有一次 `prisma.attendanceForm.findMany` 呼叫、三個新關聯皆透過同一個 `include` 物件宣告，`flatMap`/`map` 內沒有任何 `await prisma.*` 呼叫（迴圈內零額外查詢）。

AC 摘要：
- AC-1 Then：查詢結果表格中「實際產量」欄位顯示該數值
- AC-2 Then：查詢結果表格中「加班時數」欄位顯示該數值
- AC-3 Then：查詢結果表格中「配合度」欄位顯示該項目的名稱
- AC-4 Then：查詢結果表格中「3S表現」欄位顯示該項目的名稱
- AC-5 Then：查詢結果表格中「SOP表現」欄位顯示該項目的名稱
- AC-6 Then：這五個欄位皆顯示空白，比照出勤表單詳情頁既有的顯示方式，不顯示任何文字
- AC-7 Then：這五個欄位顯示空白，不額外標示或區分「因類別鎖定而清空」與「使用者原本沒填」

---

#### T-2：查詢頁前端——表格新增五欄顯示、空值 fallback (infra)
refs: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7
估時: 3 小時
風險: 低 — 純渲染新增，`?? ""` fallback 慣例已在 `forms/[id]/page.tsx` 有明確先例可直接比照，不需要新設計。

實作重點：
- `src/app/attendance-query/filters.ts`：`AttendanceQueryRow` 型別同步新增與 T-1 完全一致的五個欄位（`actualQuantity`/`overtimeHours`/`complianceRatingName`/`threeSPerformanceName`/`sopPerformanceName`），這是獨立於 `attendance-query.ts` 另外宣告的同名型別（`page.tsx` 的 `Row` 別名指向這裡，不是直接 import `attendance-query.ts` 的型別），兩份型別需手動保持同步——沿用專案既有作法（`filters.ts` 本來就是獨立重複宣告一份，不引入額外的型別共用重構，非本次範圍）。
- `src/app/attendance-query/page.tsx`：
  - `<thead>` 在「出勤類別」與「備註」之間依序插入 `<th>實際產量</th><th>加班時數</th><th>配合度</th><th>3S表現</th><th>SOP表現</th>`（FR-1，順序比照 `forms/[id]/page.tsx` 現行表頭順序）。
  - `<tbody>` 對應位置新增 `<td>{r.actualQuantity ?? ""}</td><td>{r.overtimeHours ?? ""}</td><td>{r.complianceRatingName ?? ""}</td><td>{r.threeSPerformanceName ?? ""}</td><td>{r.sopPerformanceName ?? ""}</td>`（FR-2/FR-3，逐一比照 `forms/[id]/page.tsx` 唯讀分支的 `?? ""` 寫法，不顯示「未填」文字）。
  - 「查無資料」列的 `colSpan` 從 `5` 改為 `10`（原 5 欄 + 新增 5 欄）。
  - 類別小計表格、篩選下拉（`derivePersonOptions`/`deriveCategoryOptions`/`filterRows`）不變動。
- 這是「AC 描述 UI 邏輯」（欄位是否渲染、空值是否顯示空白而非文字），屬 component test 預設範疇，專案已有 jsdom + RTL 慣例可直接沿用（`score-rules`/`score-query` 建立），不需要另外建置環境：新增 `src/app/attendance-query/page.test.tsx`，`// @vitest-environment jsdom`，mock `authFetch`，斷言：
  - 表頭包含「實際產量」「加班時數」「配合度」「3S表現」「SOP表現」五個 `columnheader`（FR-1）。
  - mock 資料中五個欄位皆有值的一列，對應儲存格顯示該值（AC-1~AC-5）。
  - mock 資料中五個欄位皆為 `null` 的一列，對應儲存格文字內容為空字串，不出現「未填」等文字（AC-6）——**同一筆 null 值斷言即同時涵蓋 AC-6 與 AC-7 的 Then 子句**：元件渲染程式碼對「值為 null」沒有任何分支判斷「是使用者沒填、還是因類別鎖定被清空」，兩者在這層是完全相同的渲染路徑，component test 不需要為 AC-7 額外準備一組「鎖定類別」的 mock 情境；「資料庫裡的值真的因鎖定而被清空」這件事本身由 T-1 的後端 pytest 驗證（見「技術決策記錄」第 2 項）。

AC 摘要：
- AC-1 Then：查詢結果表格中「實際產量」欄位顯示該數值
- AC-2 Then：查詢結果表格中「加班時數」欄位顯示該數值
- AC-3 Then：查詢結果表格中「配合度」欄位顯示該項目的名稱
- AC-4 Then：查詢結果表格中「3S表現」欄位顯示該項目的名稱
- AC-5 Then：查詢結果表格中「SOP表現」欄位顯示該項目的名稱
- AC-6 Then：這五個欄位皆顯示空白，比照出勤表單詳情頁既有的顯示方式，不顯示任何文字
- AC-7 Then：這五個欄位顯示空白，不額外標示或區分「因類別鎖定而清空」與「使用者原本沒填」

---

#### T-3：類別小計不受新增欄位影響（回歸驗證）
refs: AC-8
估時: 1 小時
風險: 低 — `computeCategorySubtotals` 本身完全不需要生產程式碼變更（函式只讀 `categoryName`），純粹是型別變更後的回歸測試補強。

實作重點：
- `computeCategorySubtotals`（`src/app/attendance-query/filters.ts` 第 48-55 行）維持不動，不新增任何依新欄位分組/統計的邏輯（FR 明確排除）。
- `src/app/attendance-query/filters.test.ts` 的 `row()` fixture helper（第 11-21 行）需同步補上 T-2 新增的五個欄位預設值，否則型別擴充後既有測試會編譯失敗（純測試檔案的必要修補，非新行為）。
- 新增回歸案例：以多筆 `categoryName` 相同、但五個擴充欄位值互不相同（含部分 null）的 rows 呼叫 `computeCategorySubtotals`，斷言小計結果只依 `categoryName` 分組計數，不因擴充欄位值不同而拆出額外的分組維度。
- 純邏輯測試，不需要 jsdom，沿用 `filters.test.ts` 既有的 plain Vitest 慣例（同 `score-rules/display.ts` 的模式）。

AC 摘要：
- AC-8 Then：小計表格仍只依「出勤類別」統計筆數，不因新增的五個欄位而新增額外的小計維度

---

#### T-4：查詢結果表格橫向捲動
refs: AC-9
估時: 1 小時
風險: 中 — 純 CSS 變更本身風險低（重用既有 `.table-scroll`，`src/app/globals.css` 第 92-95 行已存在、`forms/[id]/page.tsx` 已有先例），風險來源是驗證方式：本 AC 屬於「真實排版/是否可捲動」類別，jsdom 不做真實 CSS layout，component test 驗不到；專案目前**沒有** `playwright.config.ts`，需要先建立 Playwright 環境才能寫自動化的真實瀏覽器測試。

實作重點：
- `src/app/attendance-query/page.tsx`：查詢結果表格（`<table>`，第 96 行起）外層加上 `<div className="table-scroll">` 包住，不修改 `.table-scroll` 本身的 CSS（沿用既有定義），只包住主要資料表格，不需要包住類別小計表格（僅 2 欄，本次無寬度問題，spec 也未要求）。
- 驗證方式二選一，由 `/verify` 執行時視環境決定：
  1. **建立 Playwright 環境後寫真實瀏覽器測試**：安裝 `@playwright/test`、新增 `playwright.config.ts`、對 `/attendance-query` 頁面在窄視窗（例如 800px）下斷言 `.table-scroll` 容器的 `scrollWidth > clientWidth`，且 `document.documentElement.scrollWidth` 未超出視窗寬度（資料未溢出到整頁），測試以 `{ tag: '@AC-9' }` 標記，`npx playwright test --grep "@AC-9"` 可單獨執行。
  2. **沿用本專案既有先例**（`docs/2026-08-03-attendance-leave-lock-sop-field` 的 AC-13，同樣是「表格橫向捲動」情境）：`verification_method: static_review`（確認 `.table-scroll` wrapper 與既有 CSS class 皆未被修改、單純重用）+ `manual_log`（有瀏覽器工具的 session 對窄視窗下的實際 `scrollWidth`/`clientWidth` 做即時量測，記錄於 `evidence/`）。
- 兩種方式都符合 CLAUDE.md 允許的 `verification_method` 列舉（`playwright` 與 `manual_log` 皆在列），本 task 不預先替 `/verify` 決定要不要新建 Playwright 環境——是否值得為這一條 AC 建置全新測試基礎設施，屬於「花多少成本測一個純 CSS 重用的欄位」的取捨，留給 `/verify`（或使用者）依當下環境與時間成本判斷。

AC 摘要：
- AC-9 Then：表格可橫向捲動檢視完整欄位，資料不被裁切或遮蔽

---

## 執行順序

1. T-1（查詢層擴充，T-2 的前置依賴——沒有這五個欄位的資料，前端無從渲染）
2. T-2（頁面表格渲染，依賴 T-1 回傳的欄位與 `filters.ts` 型別同步）
3. T-3（`filters.test.ts` fixture 與回歸測試，依賴 T-2 完成的型別擴充才能編譯通過）
4. T-4（表格橫向捲動，純 CSS 且與 T-1~T-3 無資料相依，可與其他 task 平行進行，但建議在 T-2 完成、表格欄位定案後再包 wrapper，避免與 T-2 的 JSX 改動互相衝突）

---

## 技術決策記錄

1. **查詢層只回傳配合度／3S表現／SOP表現的 `name`，不回傳其 `id`**，與既有 `categoryId`（有回傳）不同。既有 `categoryId` 之所以回傳，是因為 `deriveCategoryOptions`/`filterRows` 既有的類別篩選功能需要用 id 做精確比對；本次 spec Scope 明確排除「針對這五個新欄位新增篩選功能」，沒有任何既有或本次新增的邏輯需要用到這三個 id，依 YAGNI 不預先加。若未來真的要對這些欄位加篩選，屆時再補，不在本次順便加。
2. **AC-6（未填）與 AC-7（因鎖定被清空）在前端渲染層是同一段程式碼、同一個判斷結果**——`?? ""` 對兩者一視同仁，沒有分支邏輯區分「為什麼是 null」。因此 T-2 的 component test 只需一組 null 值 mock 資料即可同時驗證兩條 AC 的 Then 子句；「資料庫裡的值真的因鎖定而被強制清空」這件事本身不是本次新開發的邏輯（沿用 `docs/2026-08-01-attendance-extended-fields` 與 `docs/2026-08-03-attendance-leave-lock-sop-field` 既有的 `saveFormRecords` 強制清空機制，本次不修改），因此該正確性由 T-1 的後端 pytest 直接對已清空的資料做查詢層透傳驗證，不需要在前端測試重複覆蓋「為什麼會是 null」。
3. **AC-9 的橫向捲動直接重用既有 `.table-scroll` class**，不新增樣式、不抽新元件。`src/app/globals.css` 第 92-95 行的定義與 `forms/[id]/page.tsx` 的使用方式皆可直接照搬，這是本次唯一的 CSS 變更點。

---

## 測試層級判斷

- T-1（查詢層資料）：AC 描述的是資料/API 行為（回傳值是否正確、是否為 null），沿用既有 pytest（Vitest + 真實 SQLite test DB）慣例，非畫面斷言，不需要 component test 或 Playwright。NFR-1（避免 N+1）以 static_review 佐證程式碼結構（單一查詢 + `include`），非執行期測試。
- T-2（頁面渲染）：AC 描述的是「畫面是否顯示指定欄位/是否顯示空白」等 UI 邏輯，非真實排版/像素/捲動類斷言，規劃為 component test（Vitest + React Testing Library，jsdom），沿用 `score-rules`/`score-query` feature 已建立的 `// @vitest-environment jsdom` + mock `authFetch` 模式（`test/jsdom-setup.ts`），不需要另外建置測試環境。
- T-3（小計回歸）：純函式輸入輸出斷言，plain Vitest，不需要 DOM。
- T-4（橫向捲動）：AC 描述的是真實排版/是否可捲動，jsdom 驗不到，是本次唯一可能需要 Playwright 的 AC；但專案目前**沒有** `playwright.config.ts`，若要用 Playwright 需先建立環境。是否值得為此建置環境、或改採本專案既有先例（`docs/2026-08-03-attendance-leave-lock-sop-field` AC-13）的 static_review + manual_log 組合，留給 `/verify` 執行時依環境與成本判斷，詳見 T-4 實作重點。

---

## 衝突事項

無。本次規劃過程中未發現 spec 假設與既有系統設計之間的衝突：
- 三層過濾邏輯（僅顯示已核准表單、僅現行版本、未填不顯示）本次未變動，Scope 已明確排除。
- 擴充欄位「因類別鎖定而被強制清空」的機制沿用既有 `saveFormRecords` 設計（`docs/2026-08-01-attendance-extended-fields`、`docs/2026-08-03-attendance-leave-lock-sop-field`），本次只是在查詢/顯示層透傳既有已清空的資料，未新增或修改鎖定規則本身。
- NFR-1「不得引入 N+1」與既有 `person`/`category` 的 `include` 設計慣例完全一致，非新的架構決策。
