依據 spec：`docs/2026-08-03-attendance-leave-lock-sop-field/spec.md`（AC-1 ~ AC-12、NFR-1 ~ NFR-3，已確認）

既有架構參考：
- `docs/architecture.md`（一資源一 `lib/*.ts` 檔案、`withErrorHandling`/`AppError` 慣例、`/categories` 頁面 tab + `LookupListPanel` 共用元件慣例）
- `docs/database.md`（手寫 migration SQL 流程、`@@map` 命名慣例、`AttendanceRecord` 四個擴充欄位的既有 force-null 不變式、`scripts/seed.cjs` 需保持 dependency-free）
- `docs/testing.md`（Vitest + 真實 SQLite test DB、`resetDb()` 慣例、既有「attendance-extended-fields」章節）
- 上一次同規模擴充的 plan 作為拆解與 traceability 格式範本：`docs/2026-08-01-attendance-extended-fields/plan.md`
- 程式碼：`src/lib/forms.ts`、`src/lib/categories.ts`、`src/lib/compliance-ratings.ts`、`src/lib/three-s-performance.ts`、`src/app/categories/lookup-list-panel.tsx`、`src/app/categories/page.tsx`、`src/app/forms/[id]/page.tsx`、`prisma/schema.prisma`、`prisma/migrations/20260801000000_add_attendance_extended_fields/migration.sql`、`scripts/seed.cjs`

## Traceability Table（AC → Task 對照）

| AC ID | AC 標題 | Task ID(s) |
|-------|---------|-----------|
| AC-1 | 事假／病假／特休鎖定除備註外欄位 | T-1, T-7 |
| AC-2 | 切入鎖定類別（未選或請假類）時清空對應範圍欄位 | T-1, T-6, T-7 |
| AC-3 | 後端拒絕繞過鎖定規則的寫入（請假類情境） | T-6, T-10 |
| AC-4 | SOP表現清單可管理且不含分數欄位 | T-1, T-2, T-4, T-5, T-9 |
| AC-5 | SOP表現欄位顯示於3S表現與實際產量之間 | T-1, T-7 |
| AC-6 | 3S表現、SOP表現下拉選單無「未選」選項 | T-7 |
| AC-7 | 出勤類別由鎖定切為可自由填寫類別時，3S表現／SOP表現自動預設為「正常」 | T-1, T-6, T-7, T-10 |
| AC-8 | 「正常」選項不可被停用或編輯 | T-1, T-2, T-3, T-4, T-5, T-9 |
| AC-9 | 配合度欄位不受影響，維持允許不選 | T-7, T-10 |
| AC-10 | SOP表現與3S表現欄位納入既有「未填」鎖定規則 | T-1, T-6, T-10 |
| AC-11 | 既有舊記錄不被本次規則回填 | T-6, T-10 |
| AC-12 | 實際產量欄位寬度改為目前一半 | T-8 |
| AC-5（AMENDED 2026-08-04） | 實際產量欄位移至出勤類別與加班時數之間 | T-12 |
| AC-13（新增 2026-08-04） | 表格橫向捲動、3S表現/SOP表現欄寬限制 | T-12 |

## Tasks

#### T-1：資料庫 schema 擴充——locksExtendedFields／SopPerformance 表／isLocked 標記／seed 更新 (infra)
refs: AC-1, AC-2, AC-3, AC-4, AC-5, AC-7, AC-8, AC-10, AC-11
估時: 5h
風險: 中 — 同一次 migration 同時涵蓋「既有表加欄位」（`attendance_category`、`three_s_performance`）與「新表」（`sop_performance`）與「既有表再加一個外鍵欄位」（`attendance_record.sopPerformanceId`），且需同步更新 `scripts/seed.cjs`（純 SQL、無 Prisma Client），任一遺漏會讓後續所有 task 的前置條件不成立。

實作重點：
- `prisma/schema.prisma`：
  - `AttendanceCategory` 新增 `locksExtendedFields Boolean @default(false)`。
  - `ThreeSPerformance` 新增 `isLocked Boolean @default(false)`（標記「正常」這筆不可停用/編輯，設計理由見「技術決策記錄」）。
  - 新增 `SopPerformance` model，結構同 `ThreeSPerformance`（`id/code(unique)/name/sortOrder/isActive/isLocked/createdAt/updatedAt`，`@@map("sop_performance")`），**不含**分數欄位。
  - `AttendanceRecord` 新增 `sopPerformanceId String?` + `sopPerformance SopPerformance?` 關聯（nullable，比照既有 `threeSPerformanceId` 的 `ON DELETE SET NULL ON UPDATE CASCADE`）。
- `prisma/migrations/20260803000000_add_leave_lock_and_sop_field/migration.sql`（手寫，比照 `20260801000000_add_attendance_extended_fields` 風格）：
  - `ALTER TABLE "attendance_category" ADD COLUMN "locksExtendedFields" BOOLEAN NOT NULL DEFAULT false;`
  - `ALTER TABLE "three_s_performance" ADD COLUMN "isLocked" BOOLEAN NOT NULL DEFAULT false;`
  - `CREATE TABLE "sop_performance" (...)` + `CREATE UNIQUE INDEX "sop_performance_code_key" ...`
  - `ALTER TABLE "attendance_record" ADD COLUMN "sopPerformanceId" TEXT REFERENCES "sop_performance" ("id") ON DELETE SET NULL ON UPDATE CASCADE;`
- 執行 `npm run db:migrate` 套用、`npx prisma generate` 重新產生 `src/generated/prisma`。
- `scripts/seed.cjs`（維持 dependency-free、直接 `better-sqlite3`，比照既有 `insertCategory` 的 prepared statement 風格）：
  - 新增 `UPDATE attendance_category SET locksExtendedFields = 1 WHERE code IN ('PERSONAL_LEAVE','SICK_LEAVE','ANNUAL_LEAVE')`（FR-1，其餘既有類別維持預設 `false`，不需額外處理）。
  - **`three_s_performance`（既有表，可能已有實際資料/引用，不可比照新表直接 insert）**：先 `SELECT id FROM three_s_performance WHERE name = '正常'` 查詢是否已存在名為「正常」的既有列（開放 CRUD 清單，開發者先前可能已手動建立）；
    - 查到 → 直接 `UPDATE three_s_performance SET isLocked = 1 WHERE id = ?` 沿用既有列（保留其既有 `code`、既有引用它的 `attendance_record` 完全不受影響）。
    - 查無 → fallback 為 idempotent insert 一筆 `code = 'NORMAL_3S'`、`name = '正常'`、`isLocked = 1`、`isActive = 1` 的新列（全新環境、尚未有人手動建立「正常」選項時適用）。
    - 兩種路徑互斥（`SELECT` 結果決定走哪一支），確保清單裡最終只會有一筆「正常」被標記鎖定，不會產生重複項目。
  - `sop_performance`（全新表，無既有資料）：直接新增一筆 `code = 'NORMAL_SOP'`、`name = '正常'`、`isLocked = 1`、`isActive = 1` 的 idempotent insert（`ON CONFLICT(code) DO NOTHING`，比照既有 `insertCategory`）。
- 已對照實際 `prisma/dev.db` 驗證此風險確實存在：`three_s_performance` 已有一筆手動建立的 `code=NORMAL`／`name=正常`，且被 8 筆既有 `attendance_record` 引用；上述「先查後決定 update-or-insert」的做法即為此案例設計，避免清單出現兩筆「正常」。

AC 摘要：
- AC-1 Then：加班時數、配合度、3S表現、SOP表現、實際產量皆呈現不可編輯狀態；備註欄位維持可編輯
- AC-2 Then：該列加班時數、配合度、3S表現、SOP表現、實際產量全部清空為 null；備註欄位的既有值不受影響、維持可編輯
- AC-4 Then：該選項出現在出勤表單填寫頁對應的下拉清單中，且該清單資料結構不含任何分數／權重欄位
- AC-5 Then：欄位順序為出勤類別／加班時數／配合度／3S表現／SOP表現／實際產量／備註，SOP表現緊接在3S表現之後、實際產量之前
- AC-7 Then：3S表現、SOP表現欄位自動帶入各自清單中「正常」選項的 id，不維持 null
- AC-8 Then：系統不提供停用／編輯／刪除該選項的操作入口，且後端對此選項的停用／編輯／刪除請求一律拒絕；「正常」選項固定存在且維持啟用狀態，清單中其餘選項的操作方式不受影響
- AC-10 Then：SOP表現、3S表現欄位與加班時數、配合度、實際產量、備註同樣呈現不可編輯狀態，且值為 null
- AC-11 Then：該記錄的3S表現欄位維持原本的 null 值，不因新規則被自動回填或改動

---

#### T-2：新增「SOP表現」清單 lib 與「正常」鎖定保護
refs: AC-4, AC-8
估時: 2.5h
風險: 低 — 直接比照 `src/lib/three-s-performance.ts` 的 CRUD pattern，額外多一段 `isLocked` 保護判斷。

實作重點：
- `src/lib/sop-performance.ts`：`listSopPerformances(activeOnly?)`、`createSopPerformance`、`updateSopPerformance`，欄位結構同 `ThreeSPerformance`（code/name/sortOrder/isActive），無 score 欄位。
- `updateSopPerformance`：更新前先 `findUnique` 取得目標列，若 `existing.isLocked === true`，一律 `throw new AppError(403, "「正常」為系統鎖定選項，不可編輯或停用")`（涵蓋「編輯」與「停用」——`isActive: false` 本質上也是走同一個 update 呼叫，同一道守門即可覆蓋 AC-8 的兩種操作）。
- 沒有新增 delete 端點（見「技術決策記錄」）。

AC 摘要：
- AC-4 Then：該選項出現在出勤表單填寫頁對應的下拉清單中，且該清單資料結構不含任何分數／權重欄位
- AC-8 Then：系統不提供停用／編輯／刪除該選項的操作入口，且後端對此選項的停用／編輯／刪除請求一律拒絕；「正常」選項固定存在且維持啟用狀態，清單中其餘選項的操作方式不受影響

---

#### T-3：既有「3S表現」lib 補上「正常」鎖定保護
refs: AC-8
估時: 1h
風險: 低 — 僅在既有 `updateThreeSPerformance` 前段加一段與 T-2 相同的守門判斷，不影響既有 CRUD 邏輯。

實作重點：
- `src/lib/three-s-performance.ts`：`updateThreeSPerformance` 更新前檢查 `existing.isLocked`，邏輯與 T-2 的 `updateSopPerformance` 完全一致（兩份 lib 各自維護一份重複判斷，理由見「技術決策記錄」）。

AC 摘要：
- AC-8 Then：系統不提供停用／編輯／刪除該選項的操作入口，且後端對此選項的停用／編輯／刪除請求一律拒絕；「正常」選項固定存在且維持啟用狀態，清單中其餘選項的操作方式不受影響

---

#### T-4：新增「SOP表現」API 路由
refs: AC-4, AC-8
估時: 1.5h
風險: 低 — 完全比照 `src/app/api/three-s-performance/route.ts`、`[id]/route.ts` 的既有 pattern（`withErrorHandling`/`requireAuth`/`requireRole("developer")`）。

實作重點：
- `src/app/api/sop-performance/route.ts`：`GET`（`requireAuth`，支援 `activeOnly` 查詢字串）、`POST`（`requireRole("developer")`）。
- `src/app/api/sop-performance/[id]/route.ts`：`PATCH`（`requireRole("developer")`），呼叫 T-2 的 `updateSopPerformance`（403 會由 `withErrorHandling` 自動轉為對應狀態碼的 JSON 回應，路由本身不需額外處理）。

AC 摘要：
- AC-4 Then：該選項出現在出勤表單填寫頁對應的下拉清單中，且該清單資料結構不含任何分數／權重欄位
- AC-8 Then：系統不提供停用／編輯／刪除該選項的操作入口，且後端對此選項的停用／編輯／刪除請求一律拒絕；「正常」選項固定存在且維持啟用狀態，清單中其餘選項的操作方式不受影響

---

#### T-5：類別管理頁面新增「SOP表現」第四分頁，`LookupListPanel` 支援鎖定列 (infra)
refs: AC-4, AC-8
估時: 3.5h
風險: 中 — `LookupListPanel` 目前僅有 `readonly`/`editable` 兩種整表模式（見 `docs/architecture.md` 的提醒：新增第四個清單時要「刻意」決定模式），本次需求是在 `editable` 模式內再加一層「單列鎖定」，若沒設計好容易讓鎖定列的編輯／停用按鈕意外露出。

實作重點：
- `src/app/categories/page.tsx`：`TABS` 新增第四項 `{ key: "sop", label: "SOP表現", apiBase: "/api/sop-performance", mode: "editable" }`。
- `src/app/categories/lookup-list-panel.tsx`：
  - `LookupItem` 型別新增 `isLocked?: boolean`（配合度清單的 API 回應不含此欄位，`undefined` 視為 falsy，不影響既有配合度分頁行為）。
  - 清單列渲染時，`item.isLocked === true` 者：不顯示「編輯」按鈕、不顯示「停用/啟用」按鈕，改顯示一個不可互動的鎖定標示（例如「鎖定」文字或圖示），其餘欄位（代碼/名稱/排序/狀態）正常顯示。
  - 新增列表單（`mode === "editable"` 才顯示）不受影響，仍可新增其餘一般選項。

AC 摘要：
- AC-4 Then：該選項出現在出勤表單填寫頁對應的下拉清單中，且該清單資料結構不含任何分數／權重欄位
- AC-8 Then：系統不提供停用／編輯／刪除該選項的操作入口，且後端對此選項的停用／編輯／刪除請求一律拒絕；「正常」選項固定存在且維持啟用狀態，清單中其餘選項的操作方式不受影響

---

#### T-6：後端核心規則——雙層鎖定／清空、SOP欄位、切換時自動預設「正常」（saveFormRecords）
refs: AC-2, AC-3, AC-7, AC-9, AC-10, AC-11
估時: 6h
風險: 高 — 這是 NFR-1／NFR-3 的核心防線，且是本次唯一需要「比較異動前後兩個狀態」才能正確判斷的邏輯（既有的 8/1 規則只需看單一 `change.categoryId` 是否為 null，本次多了「切入 `locksExtendedFields` 類別」與「由鎖定切回非鎖定時要不要補預設值」兩種需要對照前一筆資料的情境），任何一處判斷順序錯誤都可能讓 AC-3／AC-7／AC-10 其中一條悄悄失效。

實作重點：
- `src/lib/forms.ts`：`RecordChange` 型別新增 `sopPerformanceId?: string | null`。
- `saveFormRecords` 迴圈開始前，一次性查詢：
  - 所有 `AttendanceCategory`（建立 `id -> locksExtendedFields` 的 map，避免迴圈內逐筆查詢）。
  - `ThreeSPerformance`／`SopPerformance` 中 `isLocked === true` 的那一筆，取得其 id（若查無則視為異常設定，不預設，讓欄位維持 null，並保留供未來排查的空間——理論上 T-1 的 seed 已保證存在）。
- 每筆 `change` 判斷兩種鎖定範圍（取代原本單一的 `locked` 布林）：
  - `hardLocked`（未選）= `change.categoryId === null` → 清空 `note` + 加班時數／配合度／3S表現／SOP表現／實際產量，共六欄（既有規則不變，AC-10）。
  - `softLocked`（請假鎖定類）= `change.categoryId !== null && categoryLockMap.get(change.categoryId) === true` → 僅清空加班時數／配合度／3S表現／SOP表現／實際產量五欄，`note` 維持 `change.note ?? null` 正常寫入（AC-2）。
  - 兩者皆非（`unlocked`）→ 五個擴充欄位正常寫入使用者送出的值；但 3S表現／SOP表現各自套用下一點的「自動預設正常」規則。
- 自動預設「正常」（AC-7／FR-10）：需要「異動前」是否為鎖定狀態，故在迴圈內針對每筆 `change` 額外查一次目前 DB 中的 `record`（含 `categoryId`），用同一份 `categoryLockMap` 算出 `wasLocked`（`record.categoryId === null || categoryLockMap.get(record.categoryId) === true`）。當 `unlocked === true`（本次異動後非鎖定）且 `wasLocked === true`（異動前是鎖定）：
  - 若 `change.threeSPerformanceId` 為 `null` → 覆寫為前述查到的 3S「正常」id；若呼叫端已明確帶入非 null 值，維持呼叫端指定的值，不覆蓋。
  - SOP表現比照辦理。
  - `unlocked === true` 但 `wasLocked === false`（本來就不是鎖定狀態，例如既有舊資料的合法 null 或使用者只是改了備註）→ 不套用預設，維持呼叫端送出的值（含 null），對應 AC-11／FR-12「僅套用於實際切換出勤類別（鎖定→非鎖定）的操作」。
- 格式驗證（沿用既有 AC-5 舊規則，本次不變動）：`actualQuantity`/`overtimeHours` 的範圍檢查邏輯不變，僅需確認新增的 `sopPerformanceId` 不需要格式驗證（純外鍵，值域由清單保證）。
- `getFormWithRecords()` 的 Prisma `include` 加入 `sopPerformance: true`（比照既有 `complianceRating`/`threeSPerformance`）。
- `voidAndResubmitForm()` 建立新版本 records 時的欄位映射（目前逐一列出 `overtimeHours`/`complianceRatingId`/`threeSPerformanceId`/`actualQuantity`）新增 `sopPerformanceId: r.sopPerformanceId`——`docs/testing.md` 明確提醒這是「容易被悄悄漏掉」的既有回歸點，因為這裡的欄位映射是手動逐一列出而非展開整個物件。
- 確認 `assertEditable`（僅 `draft`/`rejected` 可編輯）不受影響，本次規則同樣只在可編輯狀態下透過 `saveFormRecords` 生效。

AC 摘要：
- AC-2 Then：該列加班時數、配合度、3S表現、SOP表現、實際產量全部清空為 null；備註欄位的既有值不受影響、維持可編輯
- AC-3 Then：API 拒絕該筆欄位寫入（回傳錯誤或忽略非空值，僅保留 null），不會被寫入資料庫；同一請求中的備註欄位寫入不受影響，可正常儲存
- AC-7 Then：3S表現、SOP表現欄位自動帶入各自清單中「正常」選項的 id，不維持 null
- AC-9 Then：配合度選單仍包含「未選」選項，行為與本次調整前一致，不受3S表現／SOP表現規則變更影響
- AC-10 Then：SOP表現、3S表現欄位與加班時數、配合度、實際產量、備註同樣呈現不可編輯狀態，且值為 null（不套用AC-7的「預設正常」規則，鎖定清空規則優先）
- AC-11 Then：該記錄的3S表現欄位維持原本的 null 值，不因新規則被自動回填或改動

---

#### T-7：表單填寫頁前端——SOP表現欄位、雙層鎖定顯示、下拉選單調整、切換自動預設
refs: AC-1, AC-2, AC-5, AC-6, AC-7, AC-9
估時: 6h
風險: 高 — 需同時處理欄位新增（SOP表現）、既有欄位鎖定範圍變複雜（未選＝六欄含備註 vs 請假類＝五欄不含備註）、下拉選項移除「未選」後如何呈現既有舊資料的合法 null 值（AC-11 的既有 null 記錄，畫面上沒有「未選」可選、但底層值仍是 null，需避免視覺上誤導成「已選了清單第一項」），三者互相影響，任何一處遺漏都會讓使用者以為資料狀態跟實際送出的不一致。

實作重點：
- `Category` 型別新增 `locksExtendedFields: boolean`；`EditState`/`RecordItem` 新增 `sopPerformanceId: string | null`；新增 `sopPerformances` state，`useEffect` 內新增 `authFetch("/api/sop-performance?activeOnly=true")`。
- 表格新增「SOP表現」欄，插入於「3S表現」與「實際產量」之間（AC-5），下拉邏輯比照 3S表現。
- 鎖定範圍改為兩層判斷（取代現行單一的 `rowLocked`）：
  - `hardLocked` = `getFieldValue(r, "categoryId") === null`。
  - `softLocked` = 已選類別存在且該類別 `locksExtendedFields === true`（需由 `categories` state 查出對應項目）。
  - 加班時數／配合度／3S表現／SOP表現／實際產量：`disabled={!editable || hardLocked || softLocked}`。
  - 備註：`disabled={!editable || hardLocked}`（`softLocked` 時仍可編輯，對應 AC-1）。
- `setField` 的「切入鎖定清空」分支（原本只在 `field === "categoryId" && value === null` 時觸發）擴充為：新選的 `categoryId` 若對應到 `locksExtendedFields === true` 的類別，同樣清空加班時數／配合度／3S表現／SOP表現／實際產量五欄，但**不清空備註**；只有切回未選（`value === null`）才連備註一起清空（對齊 T-6 後端的兩層規則）。
- 自動預設「正常」（AC-7，前端鏡射 T-6 的邏輯，屬 UX 即時反饋，非唯一防線）：`setField` 內，當 `field === "categoryId"` 且新選類別為 unlocked（非未選、且 `locksExtendedFields !== true`），且切換前該列是 `hardLocked` 或 `softLocked` 狀態時，若當前 `threeSPerformanceId`/`sopPerformanceId` 仍為 `null`，分別帶入 `threeSPerformances`/`sopPerformances` 中 `isLocked === true` 那筆的 id。
- 3S表現／SOP表現下拉移除「未選」`<option>`（AC-6）；但既有合法 null 值（AC-11 的舊資料、或本次上線瞬間尚未觸發過自動預設的 unlocked 列）需要能被畫面正確呈現，不誤導成「已選第一個選項」——做法：僅在目前值為 `null` 時，額外渲染一個 `disabled hidden` 的佔位 `<option value="">（未設定）</option>` 純顯示用，使用者從下拉選單本身選不到它，一旦使用者主動選了別的選項就不會再出現（與「未選」是一個可反覆選回的正常選項不同，見「技術決策記錄」）。
- 配合度欄位（下拉、含「未選」）維持完全不變（AC-9），確認本次改動未觸碰 `complianceRatingId` 相關程式碼路徑。
- `handleSave` 送出的 `changes` payload 加入 `sopPerformanceId`。

AC 摘要：
- AC-1 Then：加班時數、配合度、3S表現、SOP表現、實際產量皆呈現不可編輯狀態；備註欄位維持可編輯
- AC-2 Then：該列加班時數、配合度、3S表現、SOP表現、實際產量全部清空為 null；備註欄位的既有值不受影響、維持可編輯
- AC-5 Then：欄位順序為出勤類別／加班時數／配合度／3S表現／SOP表現／實際產量／備註，SOP表現緊接在3S表現之後、實際產量之前
- AC-6 Then：選項僅包含清單中目前啟用（active）的各項名稱，不包含「未選」這個選項
- AC-7 Then：3S表現、SOP表現欄位自動帶入各自清單中「正常」選項的 id，不維持 null
- AC-9 Then：配合度選單仍包含「未選」選項，行為與本次調整前一致，不受3S表現／SOP表現規則變更影響

---

#### T-8：實際產量輸入欄位寬度調整
refs: AC-12
估時: 0.5h
風險: 低 — 純視覺調整，不涉及資料驗證邏輯；唯一需要留意的是目前該欄位沒有任何明確寬度設定（`src/app/globals.css` 對 `input` 僅有 padding/border 等通用樣式，沒有 `width`），詳見「技術決策記錄」。

實作重點：
- `src/app/forms/[id]/page.tsx` 的實際產量 `<input type="number">` 加上明確寬度（例如 inline `style={{ width: "..." }}` 或新增一個 CSS class），數值取「調整前渲染寬度」的一半；因目前沒有顯式寬度可參照，需先在瀏覽器實測目前欄位的實際渲染寬度作為基準，再換算成一半（此為驗收階段需要人工截圖比對的項目）。
- 資料驗證（`min="1" step="1"`）與 `onChange` 邏輯不變。

AC 摘要：
- AC-12 Then：該欄位的顯示寬度為調整前寬度的一半（純視覺調整），資料驗證邏輯（僅接受正整數）不受影響

---

#### T-9：SOP表現／3S表現 lib 單元測試（含「正常」鎖定保護）
refs: AC-4, AC-8
估時: 2.5h
風險: 低 — 比照既有 `three-s-performance.test.ts` 的結構複製一份，另加鎖定保護的專屬案例。

實作重點：
- `src/lib/sop-performance.test.ts`：沿用 `resetDb()` 慣例，覆蓋 list（含/不含 inactive）、create（含重複 code 409、缺欄位 400）、update（code/name/sortOrder/isActive）、更新不存在 id 回傳 404，並明確斷言回傳結構不含 `score`/`weight`（比照 `three-s-performance.test.ts` 既有案例）。
- 兩份測試檔（`sop-performance.test.ts` 與擴充後的 `three-s-performance.test.ts`）都新增：對 `isLocked: true` 的列呼叫 `updateXxx(id, { isActive: false })` 與 `updateXxx(id, { name: "改名" })`，斷言皆 `rejects.toMatchObject({ status: 403 })`；對非鎖定列的既有 CRUD 操作不受影響（回歸測試）。

AC 摘要：
- AC-4 Then：該選項出現在出勤表單填寫頁對應的下拉清單中，且該清單資料結構不含任何分數／權重欄位
- AC-8 Then：系統不提供停用／編輯／刪除該選項的操作入口，且後端對此選項的停用／編輯／刪除請求一律拒絕；「正常」選項固定存在且維持啟用狀態，清單中其餘選項的操作方式不受影響

---

#### T-10：forms.test.ts 擴充——雙層鎖定、SOP欄位、自動預設「正常」、既有流程回歸
refs: AC-2, AC-3, AC-7, AC-9, AC-10, AC-11
估時: 5h
風險: 高 — 案例矩陣最大的一個測試 task：鎖定型態（未選 / 請假鎖定類 / 非鎖定）× 欄位（含新增的 SOP表現）× 轉換方向（鎖定→非鎖定 / 非鎖定→鎖定 / 鎖定→鎖定）交叉組合多，且要同時覆蓋既有 8/1 功能與 7/31 版本鏈（void-and-resubmit）流程的回歸，容易漏掉某個交叉情境。

實作重點：
- 準備 fixture：一筆 `locksExtendedFields: true` 的類別（例如「事假」）與一筆 `locksExtendedFields: false` 的類別（例如「正常出勤」），以及各自標記 `isLocked: true` 的 3S表現／SOP表現「正常」選項。
- AC-3／AC-10（請假鎖定類的後端防線）：某列 `categoryId` 為 `locksExtendedFields=true` 的類別，`changes` 中對該筆帶入非空的加班時數／配合度／3S表現／SOP表現／實際產量，斷言讀回這五欄皆為 `null`；同一請求中的 `note` 正常寫入（區別於未選情境會連備註一起清空）。
- AC-2：先建立一筆非鎖定類別、五個擴充欄位與備註皆有值的記錄，送出 `categoryId` 改為請假鎖定類別的變更，斷言五個擴充欄位清空為 `null`、備註維持原值不變。
- AC-7：一筆原本 `categoryId` 為未選（或請假鎖定類）、3S表現／SOP表現為 `null` 的記錄，送出 `categoryId` 改為非鎖定類別、且 `threeSPerformanceId`/`sopPerformanceId` 皆維持 `null` 的變更，斷言讀回這兩欄被自動帶入「正常」選項的 id；若呼叫端在同一次變更中明確指定了非 null 的 id，斷言維持呼叫端指定的值（不被覆蓋）。
- AC-9 回歸：確認上述任何情境都不影響 `complianceRatingId` 的既有行為（允許維持 `null`，不套用自動預設）。
- AC-11：直接以 `prisma.attendanceRecord.create()`（略過 `saveFormRecords`）建立一筆「非鎖定類別 + 3S表現為 null」的既有資料模擬記錄，呼叫 `getFormWithRecords()` 讀取，斷言 3S表現欄位仍為 `null`（純讀取不觸發自動預設）；另外驗證僅呼叫 `saveFormRecords` 修改該列 `note`、不觸碰 `categoryId` 時，3S表現仍維持 `null`（不因非「實際切換類別」的儲存動作被回填，對應 FR-12）。
- `voidAndResubmitForm` 回歸：比照既有 8/1 案例，確認 `sopPerformanceId` 與其餘欄位一樣能正確帶到新版本（涵蓋 T-6 提到的手動欄位映射風險點）。
- NFR-2 回歸：既有 `submitForm`/`approveForm`/`rejectForm` 測試不因新欄位／新規則變動而失敗。

AC 摘要：
- AC-2 Then：該列加班時數、配合度、3S表現、SOP表現、實際產量全部清空為 null；備註欄位的既有值不受影響、維持可編輯
- AC-3 Then：API 拒絕該筆欄位寫入（回傳錯誤或忽略非空值，僅保留 null），不會被寫入資料庫；同一請求中的備註欄位寫入不受影響，可正常儲存
- AC-7 Then：3S表現、SOP表現欄位自動帶入各自清單中「正常」選項的 id，不維持 null
- AC-9 Then：配合度選單仍包含「未選」選項，行為與本次調整前一致，不受3S表現／SOP表現規則變更影響
- AC-10 Then：SOP表現、3S表現欄位與加班時數、配合度、實際產量、備註同樣呈現不可編輯狀態，且值為 null（不套用AC-7的「預設正常」規則，鎖定清空規則優先）
- AC-11 Then：該記錄的3S表現欄位維持原本的 null 值，不因新規則被自動回填或改動

---

#### T-11：新增 `/api/sop-performance` 路由層 401/403 測試
refs: AC-4, AC-8
估時: 1h
風險: 低 — 比照既有 `src/app/api/three-s-performance/route.test.ts`（若存在）或 `compliance-ratings/route.test.ts` 的既有 pattern。

實作重點：
- 比照 `src/app/api/compliance-ratings/route.test.ts` 的 mock-cookie 手法，針對 `/api/sop-performance` 與 `/api/sop-performance/[id]` 各補一則：未登入呼叫寫入端點回傳 401；以 `foreman` 角色呼叫 `POST`/`PATCH` 回傳 403。

AC 摘要：
- AC-4 Then：該選項出現在出勤表單填寫頁對應的下拉清單中，且該清單資料結構不含任何分數／權重欄位
- AC-8 Then：系統不提供停用／編輯／刪除該選項的操作入口，且後端對此選項的停用／編輯／刪除請求一律拒絕；「正常」選項固定存在且維持啟用狀態，清單中其餘選項的操作方式不受影響

#### T-12：表格版面優化——實際產量欄位搬移、橫向捲動、3S表現/SOP表現欄寬限制 (infra)
refs: AC-5（AMENDED）, AC-13
估時: 1.5h
風險: 低 — 純前端 JSX 順序調整 + CSS，不涉及資料結構或後端邏輯；唯一風險是 `<select>` 的 `text-overflow: ellipsis` 在部分瀏覽器（尤其 Firefox）對原生 select 閉合態的截斷支援不一致，以 `title` 屬性作為輔助手段補足。

實作重點：
- `src/app/forms/[id]/page.tsx`：表頭 `<th>` 與每列 `<td>` 的渲染順序，將「實際產量」移到「出勤類別」之後、「加班時數」之前（可編輯與唯讀顯示兩種分支皆需同步調整，維持一致）。
- `src/app/globals.css` 新增 `.table-scroll { overflow-x: auto; }`；記錄表格外層加 `<div className="table-scroll">` 包住 `<table>`，不裁切內容，超出視窗時以捲軸檢視。
- 3S表現／SOP表現 `<select>` 加上 `style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}` 與 `title={選中選項的 name}`（實測調整前寬度分別約 334px／386px，150px 皆低於其一半）。
- 純 UI 調整，無需新增/修改測試（無對應前端元件自動化測試，既有 forms.test.ts 的後端邏輯不受影響）；驗收以 static_review + 瀏覽器實測寬度為主。

AC 摘要：
- AC-5（AMENDED）Then：欄位順序為出勤類別／實際產量／加班時數／配合度／3S表現／SOP表現／備註
- AC-13 Then：表格可橫向捲動、不裁切資料；3S表現／SOP表現欄寬限制在調整前一半以下，過長文字省略號截斷並可 hover/展開查看完整內容

---

## 執行順序

1. T-1（schema／migration／seed，所有後續 task 的前置依賴）
2. T-2、T-3 可平行進行（各自獨立的 lib 檔案）；T-6 可與兩者平行進行（只依賴 T-1 的 schema，不依賴清單管理 API）
3. T-4（依賴 T-2）
4. T-5（依賴 T-3、T-4 就緒；出勤類別、配合度分頁沿用既有 API，不需等待）
5. T-9、T-11（依賴對應 lib／API 完成後撰寫）
6. T-7（依賴 T-1 的欄位／seed 資料、T-4 的 `/api/sop-performance` 下拉資料 API；建議 T-6 完成後再一併整合驗證，因為 T-7 的自動預設邏輯是鏡射 T-6，兩者最好對照著做）
7. T-8（純視覺調整，與其他 task 無相依，可插空進行）
8. T-10（依賴 T-6 完成；建議與 T-7 完成後一併做整合層級的手動驗證，覆蓋畫面操作 + 後端規則兩層）
9. T-12（2026-08-04 新增，依賴 T-7 完成後才有 SOP表現欄位可調整順序/欄寬；純前端調整，可在其餘 task 完成後隨時插入）

## 技術決策記錄

- **「正常」選項以獨立的 `isLocked` 布林欄位標記，而非用固定 code 字串比對**：延續 `AttendanceCategory.locksExtendedFields` 的既有設計慣例（用明確欄位而非在程式碼裡到處寫死字串比對），`ThreeSPerformance`／`SopPerformance` 各自新增 `isLocked` 欄位。缺點是 `three_s_performance` 這張既有上線資料表要多一道 `ALTER TABLE`，但換來後端／前端判斷邏輯統一查欄位即可，不需要在多處硬編碼 code 字串，長期維護成本較低。
- **鎖定保護邏輯在 `compliance-ratings.ts`／`three-s-performance.ts`／`sop-performance.ts` 三份 lib 中各自重複一份，不抽共用 helper**：延續 `docs/2026-08-01-attendance-extended-fields/plan.md` 已經記錄過的既有決策（「一資源一 `lib/*.ts` 檔案」慣例，重複度高的 CRUD 邏輯不強行抽象），本次的 `isLocked` 守門判斷（約 3 行）同樣選擇在 `sop-performance.ts`／`three-s-performance.ts` 各寫一份，不新增共用模組。
- **不新增刪除（DELETE）端點**：目前 `compliance-ratings`／`three-s-performance` 皆只有 `list`／`create`／`update`（含 `isActive` 停用），系統中不存在任何「刪除」操作入口。AC-8／NFR-3 提到的「不可刪除」在缺乏刪除功能的前提下自動成立（沒有入口就無法刪除），本次不因這條 AC 額外新增一個原本不存在的刪除功能。
- **3S表現／SOP表現下拉移除「未選」後，既有合法 null 值改用一個不可被選取的隱藏 placeholder 呈現**：因為 AC-11 保留的既有 null 資料無法完全避免（舊資料、或極短暫的過渡狀態），拿掉「未選」選項後若放任 `<select>` 顯示成清單第一個選項，會讓使用者誤以為系統已經幫該筆記錄選了值。改用 `disabled hidden` 的佔位 option 只在當前值為 null 時出現、且無法被使用者手動選回，藉此和「未選」這個正式選項（AC-6 要求移除的對象）做出區隔。
- **實際產量欄位目前沒有顯式寬度設定，「一半」需以實測值換算**：`globals.css` 對 `input` 只有 padding/border 等通用樣式，沒有寬度設定，欄寬目前是瀏覽器對 `<input type="number">` 的預設渲染寬度。T-8 需要先實測目前寬度再換算成一半並寫成明確的 CSS/style 寬度值，驗收時建議附上調整前後的截圖對照（存於 `evidence/`）。

## 衝突事項

無。本次規劃過程中未發現 spec 的假設與既有系統設計（`docs/architecture.md`／`docs/database.md` 中列出的既有限制，例如 `AttendanceCategory` 唯讀限制、`saveFormRecords` 作為唯一鎖定防線的慣例）有衝突——`AttendanceCategory` 本次僅透過 `scripts/seed.cjs` 異動資料（符合其「新增/修改需經 code review、不開放畫面操作」的既有限制，未打破），「正常」選項鎖定是在既有「開放 CRUD」的 3S表現／配合度架構上新增的單列保護，未推翻既有全表可編輯的設計前提；3S表現／SOP表現的自動預設值規則已在 spec 的 Open Questions 中經人工確認套用時機（切換出勤類別當下，而非表單建立當下），非規劃階段新出現的假設衝突。
