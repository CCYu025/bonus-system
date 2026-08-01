# Plan：出勤表單擴充欄位（加班時數／配合度／3S表現／實際產量）

參考 spec：`docs/2026-08-01-attendance-extended-fields/spec.md`（AC-1 ~ AC-8，已確認）

既有架構參考：
- `prisma/schema.prisma`、`docs/database.md`（手動 migration 流程、`@@map` 命名慣例）
- `src/app/categories/page.tsx`、`src/app/api/categories/route.ts`、`src/app/api/categories/[id]/route.ts`、`src/lib/categories.ts`
- `src/app/forms/[id]/page.tsx`、`src/app/api/forms/[id]/records/route.ts`、`src/lib/forms.ts`
- `docs/architecture.md`（一資源一 lib 檔、`withErrorHandling`/`AppError` 慣例）、`docs/testing.md`（含既有「Adding tests for form-scoring fields」章節）

## Traceability Table（AC → Task 對照）

| AC ID | AC 標題 | Task ID(s) |
|-------|---------|-----------|
| AC-1 | 類別管理頁面顯示三個子分頁，出勤類別維持既有唯讀限制 | T-1, T-3, T-4, T-5, T-9, T-11 |
| AC-2 | 配合度／3S表現清單可管理且不含分數欄位 | T-1, T-3, T-4, T-9, T-11 |
| AC-3 | 加班時數下拉為 1–10 整數、無 0 選項、預設未選 | T-1, T-6 |
| AC-4 | 配合度／3S表現允許不選 | T-1, T-6 |
| AC-5 | 實際產量僅接受正整數 | T-1, T-6, T-8, T-10 |
| AC-6 | 出勤類別未填時鎖定同列其他欄位 | T-1, T-7, T-8, T-10 |
| AC-7 | 出勤類別改回未選時清空同列其他欄位 | T-1, T-7, T-8, T-10 |
| AC-8 | 後端拒絕繞過鎖定規則的寫入 | T-1, T-8, T-10 |

## Tasks

#### T-1：資料庫 schema 擴充——新增配合度／3S表現清單表與 AttendanceRecord 四欄位 (infra)
refs: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8
估時: 4h
風險: 中 — 專案採手動撰寫 migration SQL（無 `prisma migrate dev`，見 `docs/database.md`），本次同時新增兩張表＋既有表四個欄位，遺漏 index/FK 或與 `schema.prisma` 不同步的風險較高。

實作重點：
- `prisma/schema.prisma`：新增 `ComplianceRating`（`@@map("compliance_rating")`）與 `ThreeSPerformance`（`@@map("three_s_performance")`）model，欄位比照 `AttendanceCategory`：`id/code(unique)/name/sortOrder/isActive/createdAt/updatedAt`，**不含** score 欄位。
- `AttendanceRecord` 新增四欄位：`overtimeHours Int?`、`complianceRatingId String?` + `complianceRating` 關聯、`threeSPerformanceId String?` + `threeSPerformance` 關聯、`actualQuantity Int?`；四者皆為 nullable（對應 NFR-2，既有資料免回填）。
- 於 `prisma/migrations/<timestamp>_add_attendance_extended_fields/migration.sql` 手寫 `CREATE TABLE` / `CREATE UNIQUE INDEX` / `ALTER TABLE ... ADD COLUMN` + FK constraint，比照 `20260729000000_init/migration.sql` 的風格與 snake_case 表名。
- 執行 `npm run db:migrate` 套用、`npx prisma generate` 重新產生 `src/generated/prisma`。
- 確認 `scripts/seed.cjs` 不需異動（配合度／3S表現本次不預先塞資料，由開發者透過畫面新增，符合 FR-2）。

AC 摘要：
- AC-1 Then：配合度、3S表現子分頁具備新增／編輯／排序／停用功能；出勤類別子分頁維持既有停用／啟用限制，不開放新增／編輯
- AC-2 Then：該選項出現在出勤表單填寫頁對應下拉清單中，且清單資料結構不含分數／權重欄位
- AC-3 Then：選項僅含「未選」與 1–10 整數，無 0 選項，預設顯示未選
- AC-4 Then：對應欄位值為 null，不會被判定為錯誤或阻擋送出
- AC-5 Then：系統拒絕儲存並提示格式錯誤；輸入正整數可正常儲存
- AC-6 Then：加班時數、配合度、3S表現、實際產量、備註皆呈現不可編輯狀態
- AC-7 Then：該列加班時數、配合度、3S表現、實際產量、備註全部被清空為 null
- AC-8 Then：API 拒絕該筆欄位寫入（回傳錯誤或忽略非空值，僅保留 null），不會被寫入資料庫

---

#### T-3：新增「配合度」清單 lib 與 API
refs: AC-1, AC-2
估時: 3h
風險: 低 — 比照既有 `categories.ts`／API 的 CRUD pattern（`withErrorHandling`/`AppError`/`requireRole`），額外實作 create／update（出勤類別本身不需要，故無現成 create/update 可抄，需新寫）。

實作重點：
- `src/lib/compliance-ratings.ts`：`listComplianceRatings(activeOnly?)`、`createComplianceRating`、`updateComplianceRating`，欄位結構同 `AttendanceCategory`（code/name/sortOrder/isActive），無 score 欄位。
- `src/app/api/compliance-ratings/route.ts`：`GET`（`requireAuth`，支援 `activeOnly` 查詢字串）、`POST`（`requireRole("developer")`）。
- `src/app/api/compliance-ratings/[id]/route.ts`：`PATCH`（`requireRole("developer")`）。

AC 摘要：
- AC-1 Then：配合度、3S表現子分頁具備新增／編輯／排序／停用功能；出勤類別子分頁維持既有停用／啟用限制，不開放新增／編輯
- AC-2 Then：該選項出現在出勤表單填寫頁對應下拉清單中，且清單資料結構不含分數／權重欄位

---

#### T-4：新增「3S表現」清單 lib 與 API
refs: AC-1, AC-2
估時: 2h
風險: 低 — 與 T-3 為同一模式的重複實作，僅資源名稱不同。

實作重點：
- `src/lib/three-s-performance.ts`：`listThreeSPerformances(activeOnly?)`、`createThreeSPerformance`、`updateThreeSPerformance`。
- `src/app/api/three-s-performance/route.ts`：`GET`/`POST`，權限同 T-3。
- `src/app/api/three-s-performance/[id]/route.ts`：`PATCH`，`requireRole("developer")`。

AC 摘要：
- AC-1 Then：配合度、3S表現子分頁具備新增／編輯／排序／停用功能；出勤類別子分頁維持既有停用／啟用限制，不開放新增／編輯
- AC-2 Then：該選項出現在出勤表單填寫頁對應下拉清單中，且清單資料結構不含分數／權重欄位

---

#### T-5：類別管理頁面改為子分頁架構（出勤類別／配合度／3S表現） (infra)
refs: AC-1, AC-2
估時: 4h
風險: 中 — 出勤類別（唯讀/toggle-only）與配合度／3S表現（完整 CRUD）操作能力不同，共用元件需支援兩種模式，若抽象層設計不當容易讓「唯讀」模式意外洩漏新增/編輯入口。

實作重點：
- 在 `src/app/categories/` 下新增共用清單顯示元件（例如 `LookupListPanel.tsx`），支援兩種模式：
  - `readonly` 模式（出勤類別專用）：僅顯示清單＋停用/啟用按鈕，沿用既有 `setCategoryActive`，**不渲染**新增/編輯表單或入口。
  - `editable` 模式（配合度／3S表現）：內建新增列表單、編輯（code/name/sortOrder）、排序、停用/啟用按鈕（呼叫 T-3/T-4 的 API）。
- `src/app/categories/page.tsx` 改為子分頁殼層（出勤類別／配合度／3S表現三個 tab），出勤類別 tab 帶 `mode="readonly"`、其餘兩個 tab 帶 `mode="editable"` 與對應 API 路徑（`/api/compliance-ratings`、`/api/three-s-performance`）。
- 權限比照 OQ-1：頁面本身仍可被登入者檢視列表，但新增/編輯/停用操作呼叫的 API 已由後端 `requireRole("developer")` 把關（頁面不需自行做角色判斷，僅可選擇性依 `top-nav.tsx` 慣例隱藏操作按鈕給非 developer，UX only）。

AC 摘要：
- AC-1 Then：配合度、3S表現子分頁具備新增／編輯／排序／停用功能；出勤類別子分頁維持既有停用／啟用限制，不開放新增／編輯
- AC-2 Then：該選項出現在出勤表單填寫頁對應下拉清單中，且清單資料結構不含分數／權重欄位

---

#### T-6：表單填寫頁新增四個欄位（加班時數／配合度／3S表現／實際產量）UI
refs: AC-3, AC-4, AC-5
估時: 5h
風險: 中 — 四個新欄位型別各異（下拉/下拉/下拉/數字），需整合進 `forms/[id]/page.tsx` 既有的 `edits` state 與 `getFieldValue`/`setField` 機制，欄位一多容易在 state 合併時互相覆蓋。

實作重點：
- `src/app/forms/[id]/page.tsx`：`useEffect` 內新增 `authFetch("/api/compliance-ratings?activeOnly=true")`、`authFetch("/api/three-s-performance?activeOnly=true")` 取得下拉選項；`RecordItem`/`FormDetail` 型別擴充四個欄位。
- 表格新增四欄：
  - 加班時數：`<select>`，選項為「未選」+ 1–10（`Array.from({length:10}, (_,i)=>i+1)`），無 0。
  - 配合度／3S表現：`<select>`，選項含「未選」+ 對應清單 `activeOnly` 結果。
  - 實際產量：`<input type="number" min="1" step="1">`，前端可做基本格式提示（非唯一防線，後端仍需驗證，見 T-8）。
- `getFieldValue`/`setField` 泛化為支援新欄位鍵名（比照既有 `categoryId`/`note` 的 pattern）。
- `handleSave` 送出的 `changes` payload 加入四個新欄位。

AC 摘要：
- AC-3 Then：選項僅含「未選」與 1–10 整數，無 0 選項，預設顯示未選
- AC-4 Then：對應欄位值為 null，不會被判定為錯誤或阻擋送出
- AC-5 Then：系統拒絕儲存並提示格式錯誤；輸入正整數可正常儲存

---

#### T-7：表單填寫頁前端鎖定／清空行為
refs: AC-6, AC-7
估時: 3h
風險: 中 — 需與 T-6 的欄位 state 緊密配合，且要涵蓋「載入時已未填」「編輯中途改回未選」兩種情境，容易漏掉其中一種導致 UI 與後端行為不一致。

實作重點：
- 於 `forms/[id]/page.tsx` 表格渲染邏輯：當 `getFieldValue(r, "categoryId")` 為空（未選）時，加班時數／配合度／3S表現／實際產量／備註欄位一律渲染為 disabled（不論 `editable` 整體狀態為何）。
- 當使用者將某列出勤類別的 `<select>` 由已選改為空值時，`setField` 同步清空該列本地 `edits` 中其餘四個新欄位與 `note`（即使尚未送出，也讓 UI 立即反映 AC-7 的清空效果，降低使用者誤以為資料還在的困惑）。
- 這一層屬於 UX 一致性，非唯一防線——實際資料完整性仍由 T-8 的後端規則保證（NFR-1）。

AC 摘要：
- AC-6 Then：加班時數、配合度、3S表現、實際產量、備註皆呈現不可編輯狀態
- AC-7 Then：該列加班時數、配合度、3S表現、實際產量、備註全部被清空為 null

---

#### T-8：後端格式驗證與鎖定／清空規則（saveFormRecords）
refs: AC-5, AC-6, AC-7, AC-8
估時: 4h
風險: 高 — 這是 NFR-1／AC-8 的核心防線；只要新欄位中有任何一個在「出勤類別為空」情境下被漏擋，就等於資料完整性防護出現繞過路徑，且屬於本次唯一無法靠前端補救的規則。

實作重點：
- `src/lib/forms.ts`：`RecordChange` 型別新增 `overtimeHours`、`complianceRatingId`、`threeSPerformanceId`、`actualQuantity`（皆 `number | string | null` 視前端送出格式而定，需明確轉型）。
- 格式驗證（AC-5）：`actualQuantity` 非 null 時必須為正整數（拒絕 0、負數、小數、非數字），否則 `throw new AppError(400, ...)`；`overtimeHours` 非 null 時限制 1–10 整數（非任何 AC 明文要求的驗收點，但屬於同一欄位防呆，一併加上，理由見「技術決策記錄」）。
- 鎖定／清空規則（AC-6／AC-7／AC-8 共用同一規則）：在寫入前，若該筆 `change.categoryId` 為 `null`，則不論 client 傳入什麼，一律將 `overtimeHours/complianceRatingId/threeSPerformanceId/actualQuantity/note` 覆寫為 `null` 後才寫入 DB（同時滿足 AC-7 的「清空」與 AC-8 的「忽略非空值，不寫入資料庫」）。
- `getFormWithRecords()` 的 Prisma `include` 加入 `complianceRating: true, threeSPerformance: true`，確保表單詳情 API 回傳新欄位與其顯示名稱；比照既有 `category: true` 的位置一併加入 `records.include`。
- 確認 `assertEditable`（僅 `draft`/`rejected` 可編輯）邏輯不受新欄位影響，新欄位的鎖定/清空規則只在「可編輯」前提下經由 `saveFormRecords` 生效。

AC 摘要：
- AC-5 Then：系統拒絕儲存並提示格式錯誤；輸入正整數可正常儲存
- AC-6 Then：加班時數、配合度、3S表現、實際產量、備註皆呈現不可編輯狀態
- AC-7 Then：該列加班時數、配合度、3S表現、實際產量、備註全部被清空為 null
- AC-8 Then：API 拒絕該筆欄位寫入（回傳錯誤或忽略非空值，僅保留 null），不會被寫入資料庫

---

#### T-9：配合度／3S表現 lib 單元測試
refs: AC-1, AC-2
估時: 2h
風險: 低 — 直接比照既有 `src/lib/categories.test.ts` 的測試案例結構複製兩份。

實作重點：
- `src/lib/compliance-ratings.test.ts`、`src/lib/three-s-performance.test.ts`：沿用 `test/reset-db.ts` + `afterEach(resetDb)` 慣例，覆蓋 listing（含/不含 inactive）、create、update（code/name/sortOrder/isActive）、更新不存在 id 回傳 404 等案例。
- 明確斷言回傳資料結構不含任何 score/weight 欄位（對應 Out of scope 與 AC-2 的「不含分數欄位」要求，可用 `expect(Object.keys(...)).not.toContain("score")` 或型別層面確認）。

AC 摘要：
- AC-1 Then：配合度、3S表現子分頁具備新增／編輯／排序／停用功能；出勤類別子分頁維持既有停用／啟用限制，不開放新增／編輯
- AC-2 Then：該選項出現在出勤表單填寫頁對應下拉清單中，且清單資料結構不含分數／權重欄位

---

#### T-10：forms.test.ts 擴充——新欄位格式、鎖定／清空規則、既有流程回歸
refs: AC-5, AC-6, AC-7, AC-8
估時: 4h
風險: 中 — 需同時覆蓋新規則的多種組合（欄位格式 × 鎖定 × 清空）與既有 draft→submit→approve/reject→void-and-resubmit 全流程回歸（NFR-2），案例矩陣較大，容易遺漏交叉情境（例如「拒回後再次編輯」搭配新欄位）。

實作重點：
- 依 `docs/testing.md`「Adding tests for form-scoring fields」既有指引：先驗證欄位可為 null／有預設值，再重跑既有狀態轉換測試確認不受影響。
- AC-5：`actualQuantity` 傳入 `0`／負數／小數／非數字字串，斷言 `saveFormRecords` 皆 reject（`AppError` status 400）；傳入正整數（如 1、50）可正常儲存並讀回。
- AC-8（含 AC-6 的後端面）：某列 `categoryId` 已為 `null`，直接呼叫 `saveFormRecords` 並在 `changes` 中對該筆帶入非空 `overtimeHours`/`complianceRatingId`/`threeSPerformanceId`/`actualQuantity`/`note`，斷言讀回的該筆記錄四欄位與 `note` 皆為 `null`（未被寫入非空值）。
- AC-7：先建立一筆 `categoryId` 已選且四欄位與備註皆有值的記錄，再送出 `categoryId: null` 的變更，斷言該列四欄位與備註全部被清空為 `null`。
- NFR-2 回歸：擴充或重跑既有 `submitForm`/`approveForm`/`rejectForm`/`voidAndResubmitForm` 測試，確認新增四個 nullable 欄位不影響既有狀態機測試結果（既有已核准表單記錄可正常讀取，新欄位預設為 null）。

AC 摘要：
- AC-5 Then：系統拒絕儲存並提示格式錯誤；輸入正整數可正常儲存
- AC-6 Then：加班時數、配合度、3S表現、實際產量、備註皆呈現不可編輯狀態
- AC-7 Then：該列加班時數、配合度、3S表現、實際產量、備註全部被清空為 null
- AC-8 Then：API 拒絕該筆欄位寫入（回傳錯誤或忽略非空值，僅保留 null），不會被寫入資料庫

---

#### T-11：新增 API 路由層 401/403 測試
refs: AC-1, AC-2
估時: 1h
風險: 低 — 依 `docs/testing.md`「When a route-level test is worth it」慣例，僅需驗證漏加 `requireAuth`/`requireRole` 這類低機率但高風險的疏漏。

實作重點：
- 針對新路由 `/api/compliance-ratings`、`/api/compliance-ratings/[id]`、`/api/three-s-performance`、`/api/three-s-performance/[id]` 各補一則快速測試：未登入呼叫寫入端點回傳 401；以 `foreman` 角色呼叫 `POST`/`PATCH` 回傳 403。

AC 摘要：
- AC-1 Then：配合度、3S表現子分頁具備新增／編輯／排序／停用功能；出勤類別子分頁維持既有停用／啟用限制，不開放新增／編輯
- AC-2 Then：該選項出現在出勤表單填寫頁對應下拉清單中，且清單資料結構不含分數／權重欄位

## 執行順序

1. T-1（schema／migration，所有後續 task 的前置依賴）
2. T-3、T-4 可平行進行（兩份清單 lib＋API，彼此獨立）
3. T-8 可與步驟 2 平行進行（僅依賴 T-1 的 schema，不依賴清單管理 API）
4. T-5（依賴 T-3/T-4 的 API 就緒；出勤類別 tab 沿用既有 `/api/categories`，不需等待新 API）
5. T-9、T-11（依賴對應 lib／API 完成後撰寫）
6. T-6（依賴 T-1 的欄位與 T-3/T-4 的下拉資料 API）
7. T-7（依賴 T-6 的欄位 UI 就緒後才加鎖定/清空前端行為）
8. T-10（依賴 T-8 的後端規則完成；建議與 T-6/T-7 完成後一併做整合層級的手動驗證）

## 技術決策記錄

- **出勤類別維持現狀，不擴大 CRUD 範圍**：現有 `src/lib/categories.ts` 的設計註解明確限制出勤類別「不開放透過畫面／API 新增」，僅能停用/啟用（視新增類別為需經 code review 的計分詞彙）。規劃階段一度誤將 AC-1 解讀為三個子分頁操作方式須完全一致，經與使用者確認後改為方案 B：**出勤類別維持既有唯讀限制**（僅停用/啟用，新增/編輯仍須改 `scripts/seed.cjs` 並經 code review），只有配合度／3S表現這兩張全新清單開放完整 CRUD。spec.md 的 AC-1／FR-1／Scope 已同步修正（見 spec.md 開頭 `AMENDED` 標記），原本規劃的「T-2：出勤類別 CRUD 擴充」task 已移除，`categories.ts` 的既有註解與限制不變。
- **鎖定／清空規則採「一律覆寫為 null」而非逐筆拒絕**：T-8 在 `change.categoryId` 為 `null` 時，直接覆寫其餘欄位為 `null` 後寫入，而非對非空值丟出驗證錯誤。此作法同時滿足 AC-7（清空既有值）與 AC-8（忽略非空值、不寫入資料庫），且對應 spec Then 子句允許的兩種作法之一（「回傳錯誤或忽略非空值」），避免同一條規則要維護兩套分支邏輯。
- **三張清單維持各自獨立的 model／lib 檔案**：`AttendanceCategory`／`ComplianceRating`／`ThreeSPerformance` 結構相同但不合併為單一泛型資料表，比照 `docs/architecture.md` 「一資源一 `lib/*.ts` 檔案」的既有慣例；重複度高的 CRUD 邏輯改於前端以共用 UI 元件（T-5）收斂，後端維持三份平行檔案以利未來各清單獨立擴充（例如評分系統上線後三者的欄位可能分岔）。
- **加班時數的後端範圍驗證非 AC 明文要求，仍列入 T-8**：AC-3 的 Then 子句僅描述前端下拉選項，未要求後端拒絕超出 1–10 範圍的值；但基於 NFR-1「不可僅靠前端限制」的精神與一致性，T-8 仍對 `overtimeHours` 做範圍防呆，作為額外防線而非 AC-3 的驗收依據。
