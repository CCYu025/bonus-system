<!-- AC-CONFIRMED: 2026-08-04 -->
# 出勤積分規則設定（出勤類別／加班）

## 1. Problem Statement

現場出勤資料目前只記錄「發生了什麼」（出勤類別、加班時數等），但沒有「這些行為對應多少積分」的設定機制——積分是未來計算獎金的前置依據，目前完全沒有系統化的地方定義它，只能停留在人工試算或口頭約定。本次目標是新增一個獨立的「積分規則設定」分頁，讓 developer 角色可以設定「出勤類別」與「加班」這兩類考核項目各自對應的積分數值，作為未來獎金計算功能的資料基礎。本次僅止於「設定值」本身，不做任何依實際出勤紀錄計算／彙總積分的邏輯。

## 2. Scope（本次範圍）

**In scope**
- 新增獨立分頁（暫定路由 `/score-rules`），與既有 `/categories` 完全分開（不同選單項目、不同路由、不同資料表），避免類別定義與積分政策耦合在同一套 CRUD 權限與畫面上
- 頁面呈現方式為「文件式」排版（大標題／章節標題／條列項目＋積分徽章），區別於既有 `/categories` 的表格式管理介面；預設為唯讀檢視，developer 角色可切換編輯模式
- 第一章「出勤類別」：對目前啟用中的出勤類別（`假日加班` 除外）逐一設定固定積分值（可正可負整數），資料獨立存於新表 `CategoryScoreRule`（`categoryId` 外鍵參照 `AttendanceCategory.id`，不修改 `AttendanceCategory` 本身結構）
- 第二章「加班」：分「平日加班」「假日加班」兩個子章節，各自以時數級距對應積分，資料獨立存於新表 `OvertimeScoreRule`（不含任何外鍵，純規則設定，不參照任何出勤紀錄）：
  - 平日加班（互斥級距）：2 小時 → +25；3 小時（含以上，無上限）→ +40；1 小時不給分（無定義規則）
  - 假日加班（互斥級距，須同時滿足「出勤類別＝假日加班」且「加班時數達門檻」）：4–7 小時 → +50；剛好 8 小時 → +100；超過 8 小時 → 100 分基礎上每滿 1 小時再 +10；1–3 小時不給分
- 出勤類別「假日加班」在第一章的清單中不提供固定積分輸入，改標示「積分由加班規則決定」，避免與第二章的時數級距規則產生雙重定義
- 為使假日加班「超過 8 小時」級距在既有出勤表單上可被實際涵蓋，出勤表單填寫頁「加班時數」下拉選項上限由 10 擴大為 12——**此為對 `docs/2026-08-01-attendance-extended-fields/spec.md` AC-3／FR-3 的顯式修訂**，會同步在該份 spec.md 加註 AMENDED 標記與交互參照，不悄悄變更已確認內容
- 權限比照既有 `/categories`：整頁（含唯讀檢視）僅 `developer` 角色可存取，`foreman` 角色看不到選單入口，直接訪問路由或呼叫查詢 API 一律拒絕
- 每筆積分規則異動記錄 `updatedAt`／`updatedBy`（操作者 displayName 快照，比照 `AuditLog` 慣例，非 FK），作為最基本的異動追溯依據，不做生效日期版本化

**Out of scope**
- 任何依出勤紀錄實際計算、彙總積分或獎金的邏輯（本次僅設定規則本身，不消費規則、不產生任何計算結果）
- 積分規則的生效日期版本化／歷史版本回溯計算（改動分值後，舊資料如何重算不在本次處理）
- 配合度／3S表現／SOP表現／實際產量四項考核項目的積分規則，本次不新增、也不預留這四項的章節骨架
- `AttendanceForm`／`AttendanceRecord` 既有資料表結構異動；`AttendanceCategory` 不新增任何欄位（新增的兩張表皆為獨立新表）
- 既有 `/categories` 頁面的任何行為變更
- 出勤表單填寫頁「加班時數」欄位除了選項上限（10→12）以外的其他行為變更（驗證邏輯、UI 排版等維持原樣）

## 3. Functional Requirements

- FR-1：新增獨立路由頁面（暫定 `/score-rules`），僅 `developer` 角色的選單中顯示對應入口（`foreman` 不顯示），與 `/categories` 完全分開，各自獨立運作互不影響。
- FR-2：頁面預設為唯讀檢視，以文件排版呈現（大標題／章節標題／條列項目＋積分徽章）；developer 角色可切換編輯模式，對單一規則 inline 編輯後儲存。
- FR-3：新增 `CategoryScoreRule` 資料表（`categoryId` FK → `AttendanceCategory.id`、`points` Int、`updatedAt`、`updatedBy`）與對應 CRUD API；查詢與寫入皆呼叫 `requireRole("developer")`，非 developer 一律拒絕（含唯讀查詢）。
- FR-4：「出勤類別」章節列出目前 `isActive=true` 的出勤類別（`假日加班` 除外）與各自積分值；尚未設定過積分的類別顯示「未設定」，不得顯示或視為預設 0。
- FR-5：「假日加班」類別在「出勤類別」章節中不提供積分輸入欄位，顯示固定文字「積分由加班規則決定」。
- FR-6：新增 `OvertimeScoreRule` 資料表（`overtimeType`: `weekday`/`holiday`、`minHours`、`maxHours` 可為 null、`points`、`pointsPerExtraHour` 可為 null、`sortOrder`、`updatedAt`、`updatedBy`）與對應 CRUD API；查詢與寫入皆呼叫 `requireRole("developer")`，非 developer 一律拒絕（含唯讀查詢）。
- FR-7：seed 腳本（idempotent）依下列固定規則值初始化 `OvertimeScoreRule`：
  - 平日加班：`minHours=2, maxHours=2` → `points=25`；`minHours=3, maxHours=null` → `points=40`
  - 假日加班：`minHours=4, maxHours=7` → `points=50`；`minHours=8, maxHours=8` → `points=100`；`minHours=9, maxHours=null` → `points=100, pointsPerExtraHour=10`
- FR-8：「加班」章節以「平日加班」「假日加班」兩個子標題呈現，各自依 `sortOrder` 條列目前規則（例如「2 小時 → +25」「超過 8 小時 → 100 ＋ 每小時 10」）。
- FR-9：出勤表單填寫頁「加班時數」下拉選項上限由 10 擴大為 12（選項仍為「未選」＋1–12 整數，無 0），對應後端驗證範圍同步調整；此為對既有 `docs/2026-08-01-attendance-extended-fields/spec.md` AC-3／FR-3 的顯式修訂。

## 4. Acceptance Criteria

AC-1：新分頁與 `/categories` 完全分開
- Given：developer 角色登入系統
- When：從主選單導覽
- Then：「積分規則設定」（暫定路由 `/score-rules`）是獨立於「類別管理」（`/categories`）的選單項目與頁面，兩者互不影響彼此的既有功能

AC-2：出勤類別積分可設定且獨立於既有出勤類別資料
- Given：developer 進入積分規則設定頁「出勤類別」章節
- When：對某個非假日加班的啟用中類別（例如正常出勤）輸入並儲存積分值
- Then：該積分值被寫入 `CategoryScoreRule`；`AttendanceCategory` 本身的欄位（`code`/`name`/`sortOrder`/`isActive`/`locksExtendedFields`）不受任何影響

AC-3：未設定積分的類別顯示為未設定
- Given：某個啟用中的出勤類別尚未有對應的 `CategoryScoreRule` 資料
- When：檢視「出勤類別」章節
- Then：該類別顯示為「未設定」，不會被誤判為 0 分或任何預設值

AC-4：假日加班類別不提供固定積分輸入
- Given：developer 進入「出勤類別」章節
- When：檢視「假日加班」這個類別的列項
- Then：不提供積分輸入欄位，顯示固定提示文字「積分由加班規則決定」，且無法透過此章節為它設定固定積分值

AC-5：平日加班積分級距
- Given：developer 檢視「加班」章節「平日加班」子章節
- When：檢視級距清單
- Then：清單包含「2 小時 → +25」「3 小時（含以上）→ +40」兩條規則，且無 1 小時對應的積分規則（即 1 小時不給分）

AC-6：假日加班積分級距為互斥規則
- Given：developer 檢視「加班」章節「假日加班」子章節
- When：檢視級距清單
- Then：清單包含「4–7 小時 → +50」「8 小時 → +100」「超過 8 小時 → 100 ＋ 每小時 10」三條互斥規則，且無 1–3 小時對應的積分規則（即 1–3 小時不給分）

AC-7：假日加班規則需同時滿足類別與時數兩條件（規則設定層面的展示要求）
- Given：developer 檢視假日加班的規則說明
- When：閱讀該子章節的規則描述
- Then：規則描述明確標示此積分僅在「出勤類別＝假日加班」且「加班時數達到對應門檻」兩條件同時成立時才成立；本次僅要求規則的**設定與展示**清楚傳達此條件，不要求系統做任何實際判斷或計算（計算邏輯不在本次範圍）

AC-8：加班時數選項上限擴大為 12
- Given：出勤表單填寫頁面中，某人員的出勤類別已選
- When：開啟該人員的加班時數下拉選單
- Then：選項包含「未選」與 1 到 12 的整數，沒有 0 這個選項，且預設狀態顯示未選（此為對 `docs/2026-08-01-attendance-extended-fields/spec.md` AC-3 的顯式修訂）

AC-9：非 developer 角色無法編輯積分規則
- Given：非 developer 角色（或未登入）嘗試呼叫積分規則的寫入 API
- When：直接呼叫 `CategoryScoreRule`／`OvertimeScoreRule` 對應的寫入端點
- Then：API 回傳 403（未登入時回傳 401），不會寫入資料庫

AC-11：非 developer 角色無法檢視積分規則（含唯讀）
- Given：`foreman` 角色（或未登入）使用者
- When：從主選單尋找積分規則設定入口，或直接嘗試訪問 `/score-rules` 路由／呼叫查詢 API
- Then：主選單不顯示該入口；直接訪問頁面或呼叫查詢 API 一律被拒絕（頁面導向或 403/401），不會回傳任何積分規則資料

AC-10：積分規則異動留下操作紀錄
- Given：developer 修改任一筆積分規則（出勤類別或加班級距）
- When：儲存成功
- Then：該筆規則的 `updatedAt`／`updatedBy` 更新為本次操作的時間與操作者 displayName

## 5. Non-Functional Requirements（NFR）

- NFR-1：權限沿用既有集中式權限模型 — 標準：積分規則的所有 API（含查詢與寫入）皆呼叫 `requireRole("developer")`，不在路由層自行實作角色比對邏輯（比照 `docs/auth.md` 既有慣例），對應 AC-9／AC-11。
- NFR-2：新增資料表不影響既有出勤表單流程 — 標準：`AttendanceForm`／`AttendanceRecord` 既有的儲存、審核、查詢邏輯與既有測試在本次功能上線後維持全數通過，不因新增 `CategoryScoreRule`／`OvertimeScoreRule` 兩張表而改變行為。
- NFR-3：積分規則設定本身不觸發任何計算 — 標準：本次功能範圍內的 API 與畫面操作，均不讀取或寫入 `AttendanceRecord` 的任何欄位值，也不產生任何獎金／積分彙總結果。

## 6. Open Questions（已於確認階段解答，保留記錄）

- OQ-1（已解）：唯讀檢視不開放給 `foreman` 角色，整頁（含唯讀）皆限定 `developer` 才能存取，比照 `/categories` 對 foreman 隱藏選單入口。
- OQ-2（已解）：假日加班「超過 8 小時」不設封頂上限，依 1–12 小時範圍，12 小時 = 100 + 10×4 = 140 分。
- OQ-3（已解）：`CategoryScoreRule`／`OvertimeScoreRule` 的積分數值不設上下限驗證。
