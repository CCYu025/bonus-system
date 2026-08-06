# 查詢分數 — Plan

## Traceability Table（AC → Task 對照）

| AC ID | AC 標題 | Task ID(s) |
|-------|---------|-----------|
| AC-1  | 月份篩選查詢 | T-1, T-7 |
| AC-2  | 出勤類別分計算 | T-3 |
| AC-3  | 加班分計算 — 正常出勤（平日） | T-4 |
| AC-4  | 加班分計算 — 假日加班 | T-5 |
| AC-5  | 其他類別無加班分 | T-5 |
| AC-6  | 只計入核准且未作廢的紀錄 | T-2 |
| AC-7  | 個人總分加總 | T-6 |
| AC-8  | 依總分排序 | T-6, T-7 |
| AC-9  | 展開逐筆明細 | T-6, T-8 |
| AC-10 | 在職但當月無紀錄的人員仍列出 | T-2, T-7 |
| AC-11 | 當月才離職的人員列出 | T-2, T-7 |
| AC-12 | 更早月份離職的人員不列出 | T-2, T-7 |
| AC-13 | foreman 與 developer 皆可查詢 | T-1 |
| AC-14 | 未登入無法查詢 | T-1 |

---

## Tasks

#### T-1：建立查詢分數 API route 與 lib 骨架、權限、月份驗證 (infra)
refs: AC-1, AC-13, AC-14
估時: 3 小時
風險: 低 — 完全比照現有 `attendance-query` 的 route/lib 分層與 `requireAuth` 用法，無新模式。

實作重點：
- 新增 `src/app/api/score-query/by-month/route.ts`：`GET`，`withErrorHandling` 包裝，僅呼叫 `requireAuth()`（不呼叫 `requireRole`，比照 `attendance-query/by-month/route.ts`），讀取 `month` query string 交給 lib 層。
- 新增 `src/lib/score-query.ts`：先建立 `queryScoresByMonth(month: string)` 函式簽名與 `MONTH_PATTERN` 格式驗證（沿用 `attendance-query.ts` 的 `/^\d{4}-\d{2}$/` + `AppError(400, ...)` 寫法），回傳型別先定義好（`PersonScoreSummary[]`，含巢狀 `records` 明細陣列），內部計算邏輯留給 T-2～T-6 補上。
- NFR-3：錯誤一律走 `AppError` + `withErrorHandling`，不在 route 內另行手刻分支。
- 依「新增受保護 route 值得寫的測試」慣例（見 `docs/testing.md` 最後一節），新增 `src/app/api/score-query/by-month/route.test.ts`：未登入回 401（AC-14）；`foreman`／`developer` 兩種角色皆回 200、不回 403（AC-13）。此為 API 行為測試，走既有 pytest／vitest+真實 DB 慣例，不需要 component test。

AC 摘要：
- AC-1 Then：畫面顯示該月每位人員的分數彙總列（工號、姓名、出勤類別分、加班分、總分），不需其他篩選條件即可查得結果
- AC-13 Then：兩種角色皆可成功取得查詢結果，不因角色被拒絕（403）
- AC-14 Then：回傳 401，不回傳任何分數資料

---

#### T-2：基礎資料查詢 — 核准生效紀錄過濾與人員清單推導 (infra)
refs: AC-6, AC-10, AC-11, AC-12
估時: 5 小時
風險: 中 — 人員聯集邏輯（在職 ∪ 當月有合格紀錄）需要多組在職/離職/多狀態 fixture 交叉驗證，且是後續所有計分 task 的資料基礎，錯了會連帶影響 T-3～T-7。

實作重點：
- 在 `score-query.ts` 中實作合格紀錄查詢：`AttendanceForm.status = "approved"` 且 `activeDateKey` 非 null、`date` 以 `${month}-` 開頭，`records` 過濾 `voided: false` 並套用既有 `isFilledRecord`（未填不計入），完全比照 `attendance-query.ts` 的既有查詢模式與其註解說明的理由。
- 人員清單 = `Person.status = "active"` 的全部人員，**聯集** 上述查詢結果中出現過的 `personId`。刻意用集合運算取代「離職日期比對」的獨立分支：這天然滿足 AC-10（在職無紀錄→仍在 active 集合）、AC-11（當月才離職但當月有合格紀錄→在紀錄集合）、AC-12（更早離職且當月無合格紀錄→兩個集合都沒有，自然不出現），不需要額外寫日期比較邏輯（技術決策記錄第 4 項）。
- NFR-1：本 task（及本 feature 全部 task）不新增/修改任何 Prisma schema、不產生新 migration，全部即時運算。
- 這是 AC 描述資料/API 行為（哪些人員、哪些紀錄被計入），沿用既有 pytest 慣例：新增 `src/lib/score-query.test.ts`，比照 `attendance-query.test.ts` 的 fixture 風格，覆蓋：
  - 同一人同月同時有 `draft`/`pending_review`/`rejected`/作廢紀錄與一筆 `approved` 生效紀錄 → 只有後者被計入（AC-6）。
  - `status = active` 但當月無任何合格紀錄的人員仍出現，分數為 0（AC-10，此案例的「分數為 0」交由 T-6 驗證，這裡先確保人員本身有出現在結果集合中）。
  - 月中才 `terminated`、月初到離職日有合格紀錄的人員仍出現（AC-11）。
  - 更早月份已 `terminated`、查詢月份無合格紀錄的人員不出現（AC-12）。

AC 摘要：
- AC-6 Then：只有 `approved` 且生效中的紀錄被計入分數；其餘狀態的紀錄不影響該人員的總分
- AC-10 Then：該人員仍出現在列表中，出勤類別分、加班分、總分皆顯示 0
- AC-11 Then：該人員出現在列表中，分數依其該月實際核准紀錄計算
- AC-12 Then：該人員不出現在查詢結果列表中

---

#### T-3：出勤類別分計算
refs: AC-2
估時: 1.5 小時
風險: 低 — 單純 key 查找，邏輯與 `category-score-rules.ts` 既有的「未設定回 null／0」精神一致。

實作重點：
- 對每筆合格紀錄，依 `categoryId` 查 `CategoryScoreRule`；存在則取其 `points`，不存在則計為 0（含「假日加班」類別本身不會有 `CategoryScoreRule` 資料列，其出勤類別分因此自然為 0，加班分改由 T-5 的 `OvertimeScoreRule` 計算，兩者互不重疊）。
- 沿用既有 pytest 慣例，於 `score-query.test.ts` 新增案例：類別有對應規則 → 取其 points；類別無對應規則 → 0。

AC 摘要：
- AC-2 Then：若該類別存在對應的 `CategoryScoreRule`，取其 `points`；若不存在，計為 0

---

#### T-4：加班分計算 — 正常出勤（平日）
refs: AC-3
估時: 2 小時
風險: 低

實作重點：
- 對 `categoryId` 對應到「正常出勤」（`code = NORMAL`）且 `overtimeHours` 有值的紀錄，依 `overtimeHours` 落點查 `OvertimeScoreRule where overtimeType = "weekday"`（`minHours <= overtimeHours` 且 `maxHours` 為 null 或 `>= overtimeHours`），取其 `points`。
- 邊界情況（`overtimeHours` 落在既有級距之外，例如小於最小級距下限）目前 seed 資料不會出現，但程式上比照 AC-2 的 fallback 精神計為 0，不視為錯誤（技術決策記錄第 3 項）。
- pytest 慣例：於 `score-query.test.ts` 覆蓋落在不同級距的案例（含邊界值 2 小時、3 小時）。

AC 摘要：
- AC-3 Then：依 `overtimeHours` 落點套用 `OvertimeScoreRule` 中 `overtimeType = weekday` 對應級距的 `points`

---

#### T-5：加班分計算 — 假日加班（含超額每小時加成）與其他類別無加班分
refs: AC-4, AC-5
估時: 3 小時
風險: 中 — 「超過 8 小時」的加成公式需要明確基準值，spec 文字用「超過 8 小時」而非「超過該級距 `minHours`」，兩者字面上不完全等價（見技術決策記錄第 2 項），實作時容易誤用 `minHours` 而非固定 8。

實作重點：
- 對 `categoryId` 對應到「假日加班」（`code = HOLIDAY_OVERTIME`）且 `overtimeHours` 有值的紀錄，依落點查 `OvertimeScoreRule where overtimeType = "holiday"`，取其 `points`；若命中的是 `pointsPerExtraHour` 非 null 的最高一階（目前 seed 為 `minHours: 9, maxHours: null`），額外加 `pointsPerExtraHour × (overtimeHours - 8)`（固定以 8 小時為基準，不是該級距的 `minHours`）。
- AC-5：「正常出勤」「假日加班」以外的類別（事假／病假／特休等）不套用任何加班級距查找，直接回傳 0——這些類別本身 `locksExtendedFields = true`，`overtimeHours` 資料層恆為 null，函式對 `overtimeHours === null` 直接短路回 0 即可，不需要額外的類別白名單判斷。
- pytest 慣例：覆蓋假日加班一般級距、最高一階（含超額小時加成，至少測 9 小時與 12 小時兩個數值確認公式）、以及事假/病假/特休類別紀錄加班分恆為 0。

AC 摘要：
- AC-4 Then：依 `overtimeHours` 落點套用 `overtimeType = holiday` 對應級距的 `points`；若落在「超過 8 小時」的最高一階，另加 `pointsPerExtraHour × 超出的時數`
- AC-5 Then：加班分為 0（因該類別的 `overtimeHours` 恆為 `null`，不套用任何加班級距）

---

#### T-6：個人彙總、明細排序與總分排序
refs: AC-7, AC-8, AC-9
估時: 2.5 小時
風險: 低 — 純加總/排序邏輯，建立在 T-2～T-5 已驗證的單筆計分結果上。

實作重點：
- 將 T-2 過濾出的合格紀錄依人員分組，每筆紀錄的「小計」= 類別分（T-3）+ 加班分（T-4/T-5），人員的「總分」= 該人員所有小計加總（AC-7）。
- 每位人員的 `records` 明細陣列依 `date` 由舊到新排序（AC-9 的資料面；點擊展開的 UI 行為留給 T-8）。
- 最終回傳的人員陣列依 `totalScore` 由高到低排序（AC-8）。
- pytest 慣例：`score-query.test.ts` 新增多筆紀錄加總案例、明細排序案例、跨多人總分排序案例（含兩人總分相同時的穩定性，不強制規定順序但需確認不 crash／不遺漏）。

AC 摘要：
- AC-7 Then：彙總列的「總分」= 該月所有計入紀錄的（類別分 + 加班分）加總
- AC-8 Then：列表依總分由高到低排序
- AC-9 Then：該列下方展開逐筆出勤紀錄明細（日期、出勤類別、類別分、加班時數、加班分、小計），依日期由舊到新排序

---

#### T-7：查詢分數頁面 — 月份篩選與彙總表格渲染 (infra)
refs: AC-1, AC-8, AC-10, AC-11, AC-12
估時: 4 小時
風險: 低 — 頁面結構直接比照 `src/app/attendance-query/page.tsx`（月份 input + 送出 + 表格），且專案已有 jsdom + React Testing Library 慣例可直接沿用（`score-rules` feature 建立，見 `docs/testing.md`），不需要再重新建置測試環境。

實作重點：
- 新增 `src/app/score-query/page.tsx`：僅一個「月份」篩選欄位（不像 `attendance-query` 有姓名/類別下拉——OQ 未要求，spec Scope 明確排除），送出後呼叫 `/api/score-query/by-month?month=...`（`authFetch`），渲染彙總表格欄位：工號、姓名、出勤類別分、加班分、總分，直接依 API 回傳順序渲染（排序邏輯已在 T-6 的後端完成，前端不重新排序）。
- 查無資料（OQ-1，spec 已定案）：顯示空表格，不額外加提示文字。
- 這是「AC 描述 UI 邏輯」（表格是否渲染指定欄位、是否包含 0 分人員列、順序是否符合 API 回傳），屬於 component test 的預設範疇，不需要 Playwright（專案目前無 `playwright.config.ts`，且本頁不涉及真實排版/像素量測/捲動，component test 已足夠覆蓋）：新增 `src/app/score-query/page.test.tsx`，`// @vitest-environment jsdom`，mock `authFetch` 回傳固定資料，斷言：
  - 表格渲染工號/姓名/出勤類別分/加班分/總分欄位（AC-1）。
  - mock 資料按 API 回傳順序渲染（AC-8 的前端呈現面，實際排序運算已由 T-6 的 lib 測試覆蓋）。
  - mock 資料中總分為 0 的人員列有正確渲染（AC-10 的前端呈現面）。
  - 頁面只有一個月份篩選輸入，沒有姓名/類別下拉（呼應 Scope「篩選條件僅月份」）。

AC 摘要：
- AC-1 Then：畫面顯示該月每位人員的分數彙總列（工號、姓名、出勤類別分、加班分、總分），不需其他篩選條件即可查得結果
- AC-8 Then：列表依總分由高到低排序
- AC-10 Then：該人員仍出現在列表中，出勤類別分、加班分、總分皆顯示 0
- AC-11 Then：該人員出現在列表中，分數依其該月實際核准紀錄計算
- AC-12 Then：該人員不出現在查詢結果列表中

---

#### T-8：展開逐筆明細（前端互動）
refs: AC-9
估時: 2.5 小時
風險: 低

實作重點：
- 點擊彙總表格中的人員列，於該列下方展開/收合該人員的 `records` 明細（欄位：日期、出勤類別、類別分、加班時數、加班分、小計）；資料已隨 T-7 的初始查詢一併回傳（見 T-1 技術決策記錄第 1 項：不做懶加載的第二支明細 API），此 task 純粹是前端展開狀態管理（例如以 `Set<employeeId>` 或單一 `expandedId` 記錄目前展開的人員列）。
- 這是「AC 描述 UI 邏輯」（點擊後是否出現/消失明細區塊），屬於 component test 範疇：於 `page.test.tsx` 新增案例，mock 資料含至少一位有多筆明細紀錄的人員，斷言初始未展開時明細不可見、點擊列後明細出現且欄位齊全、再次點擊後收合消失。不需要 Playwright（不涉及真實排版或跨頁流程）。

AC 摘要：
- AC-9 Then：該列下方展開逐筆出勤紀錄明細（日期、出勤類別、類別分、加班時數、加班分、小計），依日期由舊到新排序

---

## 執行順序

1. T-1（API/lib 骨架、權限）
2. T-2（基礎查詢與人員聯集，後續計分 task 的資料基礎）
3. T-3 → T-4 → T-5（三個計分函式相依於 T-2 的紀錄結構，彼此邏輯獨立，可視人力平行進行，但皆須等 T-2 完成）
4. T-6（彙總排序，相依 T-3/T-4/T-5 的單筆計分結果）
5. T-7（頁面骨架與彙總表格，相依 T-1 + T-6 完成的完整 API 回傳格式）
6. T-8（展開明細互動，相依 T-7 的頁面結構）

---

## 技術決策記錄

1. **單一 API 一次回傳彙總 + 逐筆明細巢狀資料**，不做「彙總先回、點擊再打第二支明細 API」的懶加載設計。理由：資料量以單月/單一部門規模為限，比照 `attendance-query` 現有「一次抓整月，前端再篩選/展開」的既有作法，避免拆兩支 API 增加前端狀態管理複雜度。
2. **假日加班超額時數的計算基準固定為「8 小時」（`overtimeHours - 8`），而非該最高級距列自身的 `minHours` 欄位（目前 seed 為 9）。** spec AC-4 文字明確寫「超過 8 小時」而非「超過該級距下限」，兩者現況數字上差 1，用 literal 8 更貼近 spec 語意，也不會因未來 seed 調整 `minHours` 而悄悄跟著改變計算基準（若未來確實要改用 `minHours - 1` 之類的相對算法，屬於後續需求變更，非本次範圍）。
3. **出勤類別分/加班分找不到對應規則時一律計為 0**（含平日加班時數落在既有級距外的邊界情況），比照 AC-2 對「類別無對應 `CategoryScoreRule`」的既有 fallback 精神，視為合理預設，不當作錯誤處理。
4. **人員清單採「`status = active` 人員」∪「該月有合格紀錄的 `personId`」的集合運算**，不特別為 AC-11/AC-12 寫「離職日期是否落在查詢月份內」的日期比較分支——這個聯集邏輯天然同時滿足兩條 AC，程式碼更簡單也更不容易在邊界日期上出錯。

---

## 測試層級判斷（本 feature 彙整）

- 所有計分/彙總/人員清單邏輯（T-2～T-6）：AC 描述的是資料/API 行為（哪些紀錄被計入、算出的數字），沿用既有 pytest（vitest + 真實 SQLite test db）慣例，非畫面斷言，不需要 component test 或 Playwright。
- 頁面渲染與互動（T-7、T-8）：AC 描述的是「畫面是否顯示指定欄位/列」「點擊後是否展開」等 UI 邏輯，非真實排版/像素/捲動類斷言，規劃為 component test（Vitest + React Testing Library，jsdom），沿用 `score-rules` feature 已建立的 `// @vitest-environment jsdom` + mock `authFetch` 模式（`test/jsdom-setup.ts`），不需要另外建置測試環境。
- 全部 14 條 AC 皆不涉及真實瀏覽器排版/像素量測/捲動/跨頁流程，本 plan 不規劃任何 Playwright 測試；專案目前也尚未建立 `playwright.config.ts`，若後續真的出現需要真實瀏覽器驗證的 AC，需先建立該環境（本次不適用）。

---

## 衝突事項

無。本次規劃未發現 spec 假設與既有系統設計（權限模型、schema 限制、既有流程）之間的衝突：權限比照 `attendance-query` 既有的「僅 `requireAuth`、不限角色」設計（FR-6 / AC-13 / AC-14），資料不落地儲存符合 NFR-1 對 schema 的既有謹慎態度，`CategoryScoreRule`/`OvertimeScoreRule` 的既有唯讀查找模式與本次「即時計算、不新增資料表」的範圍完全一致。
