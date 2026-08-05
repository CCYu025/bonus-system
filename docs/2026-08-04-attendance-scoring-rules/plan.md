# Plan：出勤積分規則設定（出勤類別／加班）

來源：`docs/2026-08-04-attendance-scoring-rules/spec.md`（AC-CONFIRMED: 2026-08-04）

## Traceability Table（AC → Task 對照）

| AC ID | AC 標題 | Task ID(s) |
|-------|---------|-----------|
| AC-1  | 新分頁與 `/categories` 完全分開 | T-7 |
| AC-2  | 出勤類別積分可設定且獨立於既有出勤類別資料 | T-2, T-3, T-8 |
| AC-3  | 未設定積分的類別顯示為未設定 | T-2, T-8 |
| AC-4  | 假日加班類別不提供固定積分輸入 | T-9 |
| AC-5  | 平日加班積分級距 | T-4, T-5, T-10 |
| AC-6  | 假日加班積分級距為互斥規則 | T-4, T-5, T-10 |
| AC-7  | 假日加班規則需同時滿足類別與時數兩條件（展示要求） | T-10 |
| AC-8  | 加班時數選項上限擴大為 12 | T-11 |
| AC-9  | 非 developer 角色無法編輯積分規則 | T-2, T-3, T-4, T-5 |
| AC-10 | 積分規則異動留下操作紀錄 | T-2, T-4 |
| AC-11 | 非 developer 角色無法檢視積分規則（含唯讀） | T-3, T-5, T-7 |

## Tasks

#### T-1：資料模型與 migration（新表 + seed）(infra)
refs: AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-9, AC-10, AC-11

估時: 4 小時
風險: 中 — 本專案 migration 為非標準流程（Windows Application Control 擋掉 Prisma schema-engine），需手寫 SQL，且要避免誤動到 `attendance_category` 資料表本身的實體欄位。

實作重點：
- `prisma/schema.prisma` 新增 `CategoryScoreRule`（`categoryId String @unique` FK → `AttendanceCategory.id`、`points Int`、`updatedAt`、`updatedBy String`、`createdAt`）與 `OvertimeScoreRule`（`overtimeType String`（`"weekday" | "holiday"`，應用層驗證，不建 DB enum 以維持與既有 SQLite migration 風格一致）、`minHours Int`、`maxHours Int?`、`points Int`、`pointsPerExtraHour Int?`、`sortOrder Int @default(0)`、`updatedAt`、`updatedBy String`、`createdAt`）。
- `AttendanceCategory` 需新增一個**虛擬反向關聯欄位**（如 `categoryScoreRule CategoryScoreRule?`），比照 `ComplianceRating`/`ThreeSPerformance`/`SopPerformance` 現有的 `records AttendanceRecord[]` 反向關聯慣例——這不產生實際資料庫欄位（FK 實際存在於 `category_score_rule.categoryId`），不需要對 `attendance_category` 資料表下 `ALTER TABLE`，因此不違反 spec「`AttendanceCategory` 不新增任何欄位」的範圍限定（該限定應理解為不新增實體資料庫欄位/業務欄位）。見下方「技術決策記錄」第 1 項。
- 手寫 `prisma/migrations/<timestamp>_add_score_rule_tables/migration.sql`：僅 `CREATE TABLE category_score_rule`／`CREATE TABLE overtime_score_rule` 與對應 `CREATE UNIQUE INDEX`（`categoryId`），比照 `20260803000000_add_leave_lock_and_sop_field/migration.sql` 的既有語法風格；**不對 `attendance_category` 下任何 `ALTER TABLE`**。
- 執行 `npm run db:migrate` 套用 migration，再執行 `npx prisma generate` 重新產生 `src/generated/prisma`。
- `scripts/seed.cjs` 新增 idempotent 區塊，依 FR-7 固定值 seed `overtime_score_rule` 五筆（平日加班 2 筆、假日加班 3 筆，`sortOrder` 依時數遞增），比照現有 `ON CONFLICT DO NOTHING` 寫法；`CategoryScoreRule` 不 seed 任何初始資料（AC-3 要求「未設定」為合法初始狀態）。
- `test/reset-db.ts` 新增 `prisma.categoryScoreRule.deleteMany()`／`prisma.overtimeScoreRule.deleteMany()`（在 `attendanceCategory.deleteMany()` 之前，符合 FK 由子到父的既有順序）——docs/testing.md 明確提醒新表若漏掉這步，第二個用到相同 unique 值的測試會出現不直觀的 unique constraint 失敗。

AC 摘要：
- AC-2 Then：該積分值被寫入 `CategoryScoreRule`；`AttendanceCategory` 本身的欄位不受任何影響
- AC-3 Then：該類別顯示為「未設定」，不會被誤判為 0 分或任何預設值
- AC-4 Then：不提供積分輸入欄位，顯示固定提示文字「積分由加班規則決定」
- AC-5 Then：清單包含「2 小時 → +25」「3 小時（含以上）→ +40」，且無 1 小時對應的積分規則
- AC-6 Then：清單包含「4–7 小時 → +50」「8 小時 → +100」「超過 8 小時 → 100 ＋ 每小時 10」三條互斥規則
- AC-7 Then：規則描述明確標示需同時滿足類別與時數兩條件
- AC-9 Then：API 回傳 403（未登入時回傳 401），不會寫入資料庫
- AC-10 Then：該筆規則的 `updatedAt`／`updatedBy` 更新為本次操作的時間與操作者 displayName
- AC-11 Then：不會回傳任何積分規則資料

---

#### T-2：`lib/category-score-rules.ts`（出勤類別積分業務邏輯）
refs: AC-2, AC-3, AC-9, AC-10

估時: 2 小時
風險: 低

實作重點：
- `listCategoryScoreRules()`：查詢 `isActive=true` 且 `code !== "HOLIDAY_OVERTIME"` 的出勤類別（依 `sortOrder`），`include: { categoryScoreRule: true }`，回傳 `{ categoryId, categoryName, points: rule?.points ?? null, updatedAt, updatedBy }`；`points` 為 `null` 即代表「未設定」（AC-3），不得回傳或推導成 `0`。
- `upsertCategoryScoreRule(categoryId, points, updatedBy)`：以 `prisma.categoryScoreRule.upsert({ where: { categoryId }, create, update })` 實作（首次設定＝建立，之後皆為更新，語意見「技術決策記錄」第 2 項）；寫入前驗證：category 存在、`isActive=true`、`code !== "HOLIDAY_OVERTIME"`（否則 404/400，避免繞過 AC-4 直接呼叫 API 幫假日加班設定固定積分）、`points` 為整數（可正可負，依 OQ-3 不設上下限）。
- `updatedBy` 一律由呼叫端（route）傳入 `requireRole("developer")` 回傳的 `session.user.displayName`，比照 `docs/auth.md`「Operator identity is not user input」慣例，不接受 request body 帶入。
- 新增 `src/lib/category-score-rules.test.ts`（DB-backed，`resetDb()` in `afterEach`）：涵蓋「未設定回傳 `points: null`」（AC-3）、「upsert 寫入後 `AttendanceCategory` 原欄位不受影響」（用 `prisma.attendanceCategory.findUnique` 比對寫入前後的 `code/name/sortOrder/isActive/locksExtendedFields` 全部不變，AC-2）、「對 `HOLIDAY_OVERTIME` category 呼叫 upsert 應拒絕」（AC-4 的資料層防線）、「`updatedAt`/`updatedBy` 正確寫入」（AC-10）。

AC 摘要：
- AC-2 Then：該積分值被寫入 `CategoryScoreRule`；`AttendanceCategory` 本身的欄位不受任何影響
- AC-3 Then：該類別顯示為「未設定」，不會被誤判為 0 分或任何預設值
- AC-9 Then：API 回傳 403（未登入時回傳 401），不會寫入資料庫
- AC-10 Then：該筆規則的 `updatedAt`／`updatedBy` 更新為本次操作的時間與操作者 displayName

---

#### T-3：API `/api/category-score-rules`
refs: AC-2, AC-9, AC-11

估時: 1.5 小時
風險: 低

實作重點：
- `GET /api/category-score-rules`：`await requireRole("developer")`（**不是**沿用 `/api/categories` 現有的 `requireAuth`-only 模式——本頁查詢也要擋 foreman，見 spec FR-3/NFR-1/AC-11），呼叫 `listCategoryScoreRules()`。
- `PUT /api/category-score-rules/:categoryId`：`const { user } = await requireRole("developer")`，解析 body 取 `points`，呼叫 `upsertCategoryScoreRule(categoryId, points, user.displayName)`。
- 兩個 handler 都包在 `withErrorHandling(...)`，不手刻錯誤分支，比照 `docs/architecture.md`。
- 新增 `src/app/api/category-score-rules/route.test.ts`（＋`[categoryId]/route.test.ts`）：比照 `src/app/api/sop-performance/route.test.ts` 的 route-level auth test 模式（mock `next/headers`），斷言 `GET`／`PUT` 在無 session 回 401、foreman session 回 403——這是本 task 風險最高的地方，因為 `GET` 這裡刻意跟 `/api/categories` 的既有慣例不同，需要用測試把這個「唯讀也要擋」的差異釘住，避免之後被誤改成 `requireAuth`。

AC 摘要：
- AC-2 Then：該積分值被寫入 `CategoryScoreRule`；`AttendanceCategory` 本身的欄位不受任何影響
- AC-9 Then：API 回傳 403（未登入時回傳 401），不會寫入資料庫
- AC-11 Then：主選單不顯示該入口；直接訪問頁面或呼叫查詢API一律被拒絕，不會回傳任何積分規則資料

---

#### T-4：`lib/overtime-score-rules.ts`（加班積分業務邏輯）
refs: AC-5, AC-6, AC-9, AC-10

估時: 2 小時
風險: 中 — 平日／假日加班的級距資料皆為 seed 固定寫死（FR-7），本 task 只做「編輯既有規則的 points/pointsPerExtraHour」，容易不小心多寫出「依時數計算積分」之類的邏輯，需注意 spec 明確排除「任何依出勤紀錄實際計算積分」（Out of scope）。

實作重點：
- `listOvertimeScoreRules()`：查詢全部 `OvertimeScoreRule`，依 `overtimeType`（`weekday` 排前）再依 `sortOrder` 排序，直接回傳原始欄位（`minHours`/`maxHours`/`points`/`pointsPerExtraHour`），格式化成「2 小時 → +25」這類顯示字串**不在這層做**，留給前端純函式（見 T-10），維持這層只回傳資料。
- `updateOvertimeScoreRule(id, { points, pointsPerExtraHour }, updatedBy)`：只允許更新 `points`／`pointsPerExtraHour` 與追蹤欄位，**不開放建立/刪除規則列**（級距結構固定由 seed 定義，任意增刪級距不在本次 FR 範圍內，見「技術決策記錄」第 2 項）；驗證 `points` 為整數，`pointsPerExtraHour` 若非 null 也須為整數。
- 同樣不接受呼叫端傳入 `updatedBy`，由 route 從 session 帶入。
- 新增 `src/lib/overtime-score-rules.test.ts`（DB-backed）：seed 五筆固定資料後，斷言 `listOvertimeScoreRules()` 回傳的排序與級距內容符合 FR-7（AC-5/AC-6 的資料基礎）；斷言更新單筆 `points` 不影響其他筆；斷言 `updatedAt`/`updatedBy` 正確寫入（AC-10）。

AC 摘要：
- AC-5 Then：清單包含「2 小時 → +25」「3 小時（含以上）→ +40」，且無 1 小時對應的積分規則
- AC-6 Then：清單包含「4–7 小時 → +50」「8 小時 → +100」「超過 8 小時 → 100 ＋ 每小時 10」三條互斥規則
- AC-9 Then：API 回傳 403（未登入時回傳 401），不會寫入資料庫
- AC-10 Then：該筆規則的 `updatedAt`／`updatedBy` 更新為本次操作的時間與操作者 displayName

---

#### T-5：API `/api/overtime-score-rules`
refs: AC-5, AC-6, AC-9, AC-11

估時: 1.5 小時
風險: 低

實作重點：
- `GET /api/overtime-score-rules`：`await requireRole("developer")`（同 T-3，唯讀也擋 foreman）。
- `PATCH /api/overtime-score-rules/:id`：`await requireRole("developer")`，取 `user.displayName` 傳入 `updateOvertimeScoreRule`。
- 包在 `withErrorHandling(...)`。
- 新增 `route.test.ts`：比照 T-3，斷言 401/403，涵蓋 `GET` 與 `PATCH` 兩者。

AC 摘要：
- AC-5 Then：清單包含「2 小時 → +25」「3 小時（含以上）→ +40」，且無 1 小時對應的積分規則
- AC-6 Then：清單包含「4–7 小時 → +50」「8 小時 → +100」「超過 8 小時 → 100 ＋ 每小時 10」三條互斥規則
- AC-9 Then：API 回傳 403（未登入時回傳 401），不會寫入資料庫
- AC-11 Then：主選單不顯示該入口；直接訪問頁面或呼叫查詢API一律被拒絕，不會回傳任何積分規則資料

---

#### T-6：Component test 基礎設施建置（Vitest + React Testing Library）(infra)
refs: AC-1, AC-3, AC-4, AC-5, AC-6

估時: 2 小時
風險: 中 — `docs/testing.md` 目前只有 node 環境的 DB-backed 慣例（`vitest.config.ts` 全域 `environment: "node"`），本專案至今沒有任何 `jsdom`/RTL 測試，需要新增這層而不能假設已存在；同時要避免影響既有 DB-backed 測試套件（`fileParallelism: false`、`global-setup.ts` 建 `test.db` 等既有設定）。

實作重點：
- 安裝 `@testing-library/react`、`@testing-library/jest-dom`、`jsdom`。
- **不**修改 `vitest.config.ts` 全域 `environment`，改用 Vitest 逐檔案的 `// @vitest-environment jsdom` 註解指示（檔案開頭第一行）套用在本次新增的 UI 顯示邏輯測試檔案，其餘既有 node 環境的 DB-backed 測試不受影響（見「技術決策記錄」第 3 項）。
- 建立最小共用測試設定（例如 `test/jsdom-setup.ts` 匯入 `@testing-library/jest-dom` 的 matcher），並在需要的測試檔案的 `setupFiles`/import 中使用；若 vitest 版本的 per-file environment 指示與全域 `setupFiles`（`test/setup-env.ts`，指向 `DATABASE_URL`）互相干擾，需確認純顯示邏輯測試檔案不觸發 DB 連線（不 import `@/lib/prisma`）。
- 本 task 不含任何實際頁面測試，只建置基礎設施，供 T-7～T-10 使用。

AC 摘要：
- AC-1 Then：「積分規則設定」是獨立於「類別管理」的選單項目與頁面
- AC-3 Then：該類別顯示為「未設定」，不會被誤判為 0 分或任何預設值
- AC-4 Then：不提供積分輸入欄位，顯示固定提示文字「積分由加班規則決定」
- AC-5 Then：清單包含「2 小時 → +25」「3 小時（含以上）→ +40」
- AC-6 Then：清單包含「4–7 小時 → +50」「8 小時 → +100」「超過 8 小時 → 100 ＋ 每小時 10」

---

#### T-7：`/score-rules` 頁面骨架 + 選單整合
refs: AC-1, AC-11

估時: 2.5 小時
風險: 中 — 權限模型刻意跟 `/categories` 既有唯讀慣例不同（見 T-3 說明），頁面骨架若沿用錯的 fetch 慣例會讓 foreman 直接訪問時看到比預期更多東西（雖然實際規則資料仍會被 API 擋下）。

實作重點：
- 新增 `src/app/score-rules/page.tsx`（`"use client"`，effect-driven fetch，比照既有頁面模式，不引入 Server Component 資料流）：頁面 mount 後分別呼叫 `authFetch("/api/category-score-rules")`、`authFetch("/api/overtime-score-rules")`；`res.ok === false` 時比照 `src/app/accounts/page.tsx` 既有慣例（不特別導頁，僅維持空清單狀態，403 由 API 擋、401 由 `authFetch` 自動導向 `/login`），不新增額外的頁面層級角色判斷邏輯（維持「唯一強制邊界在 API」的既有慣例，見 `docs/auth.md`）。
- `src/app/top-nav.tsx` 新增「積分規則設定」連結，放進既有 `me?.role === "developer"` 區塊（與「帳號管理」同組），不是無條件顯示（不可比照 `/categories` 連結目前對所有角色可見的既有寫法——那是既有頁面的既定行為，本次不動它，也不該讓新頁面沿用同一顯示規則，見「技術決策記錄」第 4 項）。
- 頁面採「文件式」排版容器（大標題 `<h1>`、章節 `<h2>`「出勤類別」/「加班」）與唯讀/編輯模式切換（`useState<"view" | "edit">`），編輯模式僅影響渲染（是否顯示輸入框/儲存按鈕），不影響資料存取邊界（邊界仍在 API）。
- 新增 `src/app/score-rules/page.test.tsx`（jsdom，依 T-6 基礎設施）：不整合真實 API，改用 mock `fetch`／`authFetch`，斷言頁面渲染出兩個章節標題；`top-nav.test.tsx`：mock `/api/auth/me` 回傳 developer/foreman 兩種角色，斷言「積分規則設定」連結僅在 developer 下出現（AC-1／AC-11 的選單隱藏部分）。

AC 摘要：
- AC-1 Then：「積分規則設定」（暫定路由 `/score-rules`）是獨立於「類別管理」（`/categories`）的選單項目與頁面，兩者互不影響彼此的既有功能
- AC-11 Then：主選單不顯示該入口；直接訪問頁面或呼叫查詢API一律被拒絕，不會回傳任何積分規則資料

---

#### T-8：「出勤類別」章節 UI（含未設定顯示、inline 編輯）
refs: AC-2, AC-3

估時: 2.5 小時
風險: 低

實作重點：
- 條列 `GET /api/category-score-rules` 回傳的每筆類別＋積分徽章；`points === null` 時徽章文字顯示「未設定」，`points` 非 null 時顯示實際數值（含負數）。
- 編輯模式下，單筆 inline 編輯（輸入框＋儲存按鈕），儲存呼叫 `PUT /api/category-score-rules/:categoryId`，成功後重新載入清單。
- 建議把「給定 `points: number | null` → 回傳顯示字串」抽成純函式（如 `src/app/score-rules/display.ts` 的 `formatCategoryPoints(points: number | null): string`），比照既有 `src/app/attendance-query/filters.ts` 的純邏輯拆分慣例，用一般 Vitest（不需 jsdom）測試「未設定」／正數／負數三種情境（AC-3），比引入完整元件渲染測試更輕量；元件本身的整合行為（是否正確呼叫這個函式並渲染）再用 T-6 建立的 jsdom 元件測試補一層薄的整合斷言。
- AC-2 的「寫入正確、`AttendanceCategory` 欄位不受影響」核心斷言已由 T-2 的 DB-backed 測試覆蓋，此處元件測試只需斷言儲存按鈕觸發正確的 API 呼叫（payload 正確），不重複斷資料庫狀態。

AC 摘要：
- AC-2 Then：該積分值被寫入 `CategoryScoreRule`；`AttendanceCategory` 本身的欄位不受任何影響
- AC-3 Then：該類別顯示為「未設定」，不會被誤判為 0 分或任何預設值

---

#### T-9：「假日加班」類別特殊列（不可編輯固定文字）
refs: AC-4

估時: 1 小時
風險: 低

實作重點：
- 「出勤類別」章節渲染時，對 `code === "HOLIDAY_OVERTIME"` 的項目**不渲染**積分輸入框／編輯按鈕，改渲染固定文字「積分由加班規則決定」（不可透過此章節設定固定積分值，資料層防線已在 T-2 完成）。
- jsdom 元件測試（依 T-6）：給定 fixture 含一筆 `code: "HOLIDAY_OVERTIME"`，斷言畫面上該列**不存在** `<input>`／編輯按鈕，且存在「積分由加班規則決定」文字——這類「元素是否渲染」的斷言正是 jsdom 元件測試相對於純函式測試的必要之處（無法只靠字串格式化函式驗證「有沒有 input」）。

AC 摘要：
- AC-4 Then：不提供積分輸入欄位，顯示固定提示文字「積分由加班規則決定」，且無法透過此章節為它設定固定積分值

---

#### T-10：「加班」章節 UI（平日／假日子章節、級距清單、雙條件說明）
refs: AC-5, AC-6, AC-7

估時: 3 小時
風險: 中 — 級距文字格式化規則較多（含「超過 8 小時」的動態算式敘述），需注意本 task 僅是「把 seed 好的固定規則格式化成文字顯示」，不可誤寫成依加班時數即時計算積分的邏輯（Out of scope）。

實作重點：
- 依 `GET /api/overtime-score-rules` 回傳資料，用 `overtimeType` 分成「平日加班」「假日加班」兩個 `<h3>` 子章節，各自依 `sortOrder` 條列。
- 抽出純函式 `formatOvertimeRuleLabel(rule): string`（同 T-8 的純邏輯拆分慣例）：`pointsPerExtraHour === null` 時輸出「{min}[–{max}] 小時 → +{points}」或「{min} 小時（含以上）→ +{points}」（`maxHours === null` 情形）；`pointsPerExtraHour` 非 null 時輸出「超過 {min-1} 小時 → {points} ＋ 每小時 {pointsPerExtraHour}」。一般 Vitest 測試（不需 jsdom）直接餵 FR-7 的五筆固定資料，斷言輸出字串符合 AC-5／AC-6 列出的例句。
- 假日加班子章節額外渲染一段固定說明文字（滿足 AC-7）：明確標示「此積分僅在出勤類別為假日加班，且加班時數達到對應門檻時才成立」，純靜態文案，不做任何條件判斷或計算——此類靜態文案存在與否，用 jsdom 元件測試斷言文字節點存在即可（依 T-6）。

AC 摘要：
- AC-5 Then：清單包含「2 小時 → +25」「3 小時（含以上）→ +40」兩條規則，且無 1 小時對應的積分規則
- AC-6 Then：清單包含「4–7 小時 → +50」「8 小時 → +100」「超過 8 小時 → 100 ＋ 每小時 10」三條互斥規則，且無 1–3 小時對應的積分規則
- AC-7 Then：規則描述明確標示此積分僅在「出勤類別＝假日加班」且「加班時數達到對應門檻」兩條件同時成立時才成立；本次僅要求規則的設定與展示清楚傳達此條件

---

#### T-11：加班時數下拉上限 10→12（既有欄位修改）
refs: AC-8

估時: 2 小時
風險: 中 — 這是對既有已上線功能（`docs/2026-08-01-attendance-extended-fields`）的欄位修改，需同步檢查既有測試沒有寫死「上限 10／11 不合法」之類會被本次變更打破的斷言。

實作重點：
- `src/app/forms/[id]/page.tsx`：`OVERTIME_HOUR_OPTIONS` 由 `Array.from({ length: 10 }, ...)` 改為 `Array.from({ length: 12 }, ...)`（選項仍為「未選」＋1–12整數，無 0）。
- `src/lib/forms.ts`：`saveFormRecords` 內加班時數驗證範圍由 `overtimeHours > 10` 改為 `overtimeHours > 12`，錯誤訊息「加班時數須為 1 到 10 的整數」同步改為「1 到 12」。
- 檢查並更新 `src/lib/forms.test.ts` 既有涵蓋加班時數格式驗證的案例（docs/testing.md 提及的「`overtimeHours` must be 1–10」相關測試）：新增 11、12 為合法、13 為不合法的邊界案例，移除/修正任何寫死「10 為上限」字樣的斷言或註解。
- 因 `OVERTIME_HOUR_OPTIONS` 是純常數陣列（無條件邏輯），選項數量本身風險低；若 T-6 的 jsdom 基礎設施已就緒，可額外補一個輕量元件測試斷言下拉選單選項數為 13 個（未選 + 1–12），成本已降低，建議補上但非阻斷項。
- 加班時數欄位驗證邏輯本身（AC-6/AC-7 的鎖定規則、非整數/0 拒絕等）維持既有行為不動，僅範圍上限變更（Out of scope 已明確排除其餘行為變更）。
- 確認 `docs/2026-08-01-attendance-extended-fields/spec.md` 的 AMENDED 標記與交互參照已存在（使用者已確認完成，此 task 僅需程式碼跟上）。

AC 摘要：
- AC-8 Then：選項包含「未選」與 1 到 12 的整數，沒有 0 這個選項，且預設狀態顯示未選（此為對 `docs/2026-08-01-attendance-extended-fields/spec.md` AC-3 的顯式修訂）

---

## 執行順序

1. T-1（資料模型／migration／seed，其餘 task 的地基）
2. T-2 → T-3（出勤類別積分：lib → API）
3. T-4 → T-5（加班積分：lib → API，可與 T-2/T-3 平行）
4. T-6（component test 基礎設施，需在 T-7～T-10 之前備妥）
5. T-7（頁面骨架＋選單整合，需 T-3/T-5 的 API 已存在才能串接）
6. T-8、T-9、T-10（三個章節 UI，彼此獨立，可平行進行，皆依賴 T-7 的頁面骨架與 T-6 的測試基礎設施）
7. T-11（加班時數上限變更，與其餘 task 無相依，可在任何時間點插入執行）

## 技術決策記錄

1. **`AttendanceCategory` 的虛擬反向關聯欄位不算違反「不新增欄位」限定**：spec 的 Out of scope 明確排除 `AttendanceCategory` 新增欄位，但 Prisma 要求關聯的「一」側宣告反向欄位才能通過 schema 驗證（既有 `ComplianceRating.records`/`ThreeSPerformance.records` 等皆是此模式）。這個反向欄位不對應任何實際資料庫欄位，migration SQL 不會 `ALTER TABLE attendance_category`，因此判定不落入 spec 限定的範圍內。
2. **CRUD 的實際落地方式**：FR-3/FR-6 寫「CRUD API」，但 FR-2/FR-7 顯示實際操作模型是「唯讀 + 對既有規則 inline 編輯」。`OvertimeScoreRule` 五筆規則全數由 seed 建立，API 僅開放 `PATCH`（更新 `points`/`pointsPerExtraHour`），不開放新增/刪除級距列；`CategoryScoreRule` 因每個類別最多一筆、且「首次設定」在語意上等同建立，API 採 `PUT .../:categoryId` 的 upsert 設計，不是傳統各自獨立的 POST/DELETE。
3. **新增 jsdom 測試層採逐檔案指示，不改動全域 `vitest.config.ts`**：本專案目前僅有 node 環境的 DB-backed 測試慣例，為避免影響既有測試套件的 `fileParallelism`/`global-setup` 設定，本次新增的 UI 顯示邏輯測試改用 Vitest 逐檔案的 `// @vitest-environment jsdom` 指示，而非切換全域 `environment`。
4. **新頁面選單連結權限模型刻意不沿用 `/categories` 現況**：`src/app/top-nav.tsx` 現有的「類別管理」連結對所有登入角色皆可見（沒有 `me?.role === "developer"` 判斷），但 spec OQ-1 明確要求 `/score-rules` 整頁（含唯讀）僅 developer 可見/可存取。這不是既有系統限制被打破的情況（沒有任何文件/註解要求所有 lookup 頁面都必須對兩個角色開放唯讀），而是本次功能明確要求更嚴格的權限模型，故新連結改放進既有的 developer-only 連結群組（帳號管理/待審核佇列），不比照「類別管理」連結目前的顯示規則。

## 測試層級判斷摘要

- AC-2／AC-9／AC-10：資料/API 行為（狀態寫入、權限拒絕、稽核欄位）→ 沿用既有 pytest（此專案為 Vitest）慣例，DB-backed lib 測試（T-2/T-4）＋ route-level 401/403 測試（T-3/T-5），不需要 UI 測試。
- AC-3／AC-4／AC-5／AC-6／AC-7：UI 顯示邏輯（未設定文字、假日加班特殊列、級距清單文字、雙條件說明）→ 能抽成純函式的部分（顯示字串格式化，T-8/T-10）優先用一般 Vitest 測試，比照既有 `src/app/attendance-query/filters.ts` 的純邏輯拆分慣例；無法用純函式驗證的「元素是否渲染」類斷言（如 AC-4 的「不存在 input」）才用 T-6 新建的 jsdom + React Testing Library 元件測試。
- AC-1／AC-11：選單可見性與頁面/API 存取邊界 → 真正的安全邊界由 route-level 401/403 測試（T-3/T-5）覆蓋；選單連結是否依角色顯示為 UX 層純渲染邏輯，用 T-6 的元件測試對 `top-nav.tsx` 補一層薄斷言。
- AC-8：純資料驗證範圍變更（下拉選項為常數陣列、後端數字範圍檢查）→ 主要以既有 `forms.test.ts` 的 Vitest DB-backed 案例覆蓋邊界值，前端選項數量測試為低成本情況下的建議項，非必要阻斷項。
- 本次沒有任何 AC 描述真實排版/像素量測/可捲動性/跨頁流程等 jsdom 驗不到的行為，且目標專案目前沒有 `playwright.config.ts`；因此**不規劃 Playwright 測試**，也不需要建立 Playwright 環境。
