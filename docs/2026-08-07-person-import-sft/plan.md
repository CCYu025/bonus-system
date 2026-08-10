# 人員主檔匯入 SFT 生產日報表 — 實作計畫

來源：`docs/2026-08-07-person-import-sft/spec.md`（已確認，2026-08-07）

## Traceability Table（AC → Task 對照）

| AC ID | AC 標題 | Task ID(s) |
|-------|---------|-----------|
| AC-1  | 匯入入口顯示於人員主檔管理頁面 | T-8 |
| AC-2  | 姓名相符、代號不符 → 判定為取代 | T-2, T-6, T-9 |
| AC-3  | 代號相符、姓名不符 → 判定為取代 | T-2, T-6, T-9 |
| AC-4  | 代號與姓名皆相符 → 不列入清單 | T-2, T-6 |
| AC-5  | 代號與姓名皆不符 → 判定為新增 | T-2, T-6, T-9 |
| AC-6  | 離職人員不列入比對範圍 | T-2, T-6 |
| AC-7  | 新增候選與離職人員代號衝突 → 判定為無法匯入 | T-2, T-6, T-9 |
| AC-8  | 預覽項次預設未勾選 | T-9 |
| AC-9  | 確認套用只執行已勾選項次 | T-3, T-7, T-9 |
| AC-10 | 取代動作正確更新對應欄位，且不影響出勤歷史 | T-3, T-7 |
| AC-11 | 取消不寫入任何資料 | T-9 |
| AC-12 | 班長可執行匯入套用 | T-4, T-7 |
| AC-13 | 班長可新增人員（既有功能權限放寬） | T-4, T-5 |
| AC-14 | 班長可將人員設為離職（既有功能權限放寬） | T-4, T-5 |
| NFR-1 | 預覽階段不得寫入資料庫 | T-1, T-6 |
| NFR-2 | 套用動作需具備交易一致性 | T-3, T-7 |

---

## Tasks

#### T-1：新增 xls 解析依賴，建立檔案讀取工具函式 [(infra)]
refs: AC-1（NFR-1 一併於此任務把關）
估時: 3h
風險: 中 — 專案目前完全沒有 xls/xlsx 解析套件（`package.json` 內無 `xlsx`/`exceljs` 等依賴），且僅口頭確認過 `.xls` BIFF8 格式能解析（見 spec Open Questions），需要一份接近真實的 SFT 報表 `.xls` 樣本作為測試 fixture，目前不存在。

實作重點：
- 新增 `xlsx`（SheetJS）npm 依賴，讀取模式僅用 `read`/`utils.sheet_to_json`，不使用寫入功能。
- 新增 `src/lib/persons-import.ts`（或類似命名）內的 `parseSftReport(buffer): { employeeId: string; name: string }[]`：只解析「員工代號」「姓名」兩欄標題對應的欄位，忽略其餘欄位（FR-2）。
- 找不到「員工代號」或「姓名」欄位標題時，丟出通用 `AppError(400, "檔案格式無法解析")`（spec Open Questions 已載明不特別客製化錯誤訊息）。
- 這一層**只做解析，不查詢/不寫入 DB**，物理上把它跟 T-2 的比對邏輯、T-6 的路由分開檔案，讓 NFR-1「預覽階段不得呼叫 create/update」在結構上更難被意外違反。
- 測試層級：資料/邏輯行為，沿用既有 pytest 慣例即可（Vitest + 真實檔案 buffer 輸入輸出斷言），不需要 DOM。需另外建立一個測試用 `.xls` fixture（可用同一顆 `xlsx` 套件寫出一份最小樣本檔，欄位只含「員工代號」「姓名」＋幾筆資料，存放於 `src/lib/__fixtures__/` 或就近於 `persons-import.test.ts` 旁）。

AC 摘要：
- （本 task 無獨立 AC，屬於 AC-2～AC-7 共用的解析前置作業；NFR-1）

---

#### T-2：比對分類核心邏輯（FR-3／FR-4 規則引擎）
refs: AC-2, AC-3, AC-4, AC-5, AC-6, AC-7
估時: 3h
風險: 中 — 判定規則分支多（代號符合／姓名符合／皆符合／皆不符合／新增撞離職代號），且需正確排除離職人員（AC-6）不誤判為「取代」目標，也不誤判為「新增」時漏檢查離職代號衝突（AC-7）。

實作重點：
- 於 `src/lib/persons-import.ts` 新增 `classifyImportRows(rows, { activePersons, terminatedPersons })`（或直接查 DB 版本），依序判定每筆：皆符合→略過（AC-4）；恰一項符合→取代，回傳現有人員與匯入值的對照（AC-2/AC-3）；皆不符合→新增（AC-5）；新增候選代號撞離職人員→無法匯入，附占用者姓名（AC-7）。
- 比對範圍先過濾 `status: active`（FR-3 開頭），離職人員只在 AC-7 的代號衝突檢查時另外查一次（AC-6：離職人員不得被當成「取代」比對對象）。
- Out of Scope 明列的三種邊界情況（同報表兩筆指向同一人、一筆同時分別符合兩位不同的人、離職人員互相比對）不需要處理，寫成程式時不用為它們額外加防呆分支。
- 測試層級：資料/邏輯行為，DB-backed `persons-import.test.ts`（`resetDb()` + 真實 `prisma.person` fixture），比照 `docs/testing.md` 既有 `lib/*.test.ts` 慣例，逐一覆蓋 AC-2～AC-7 六個分支。

AC 摘要：
- AC-2 Then：預覽清單出現一筆標示「取代」的項次，顯示該人員現有的員工代號與匯入的員工代號
- AC-3 Then：預覽清單出現一筆標示「取代」的項次，顯示該人員現有的姓名與匯入的姓名
- AC-4 Then：該筆資料不出現在預覽清單中
- AC-5 Then：預覽清單出現一筆標示「新增」的項次，顯示匯入的員工代號與姓名
- AC-6 Then：該筆資料的比對結果視為與在職人員皆不相符，依 AC-5 或 AC-7 規則判定
- AC-7 Then：預覽清單出現一筆標示「無法匯入」的項次，附上衝突原因（占用者姓名），該項次的勾選框為停用狀態

---

#### T-3：套用邏輯（新增／更新既有人員，交易一致性）
refs: AC-9, AC-10, AC-11（NFR-2）
估時: 3h
風險: 中 — 需在單一 `prisma.$transaction` 內混合處理「更新既有人員」與「建立新人員」兩種動作，且只處理呼叫端傳入的已勾選子集；另有一個 spec 未明講的邊界情況需要防禦式處理，見下方技術決策記錄第 6 項。

實作重點：
- 新增 `applyImportSelections(selections)`：每筆 selection 帶分類結果（取代/新增）＋對應動作所需欄位，全部包在 `prisma.$transaction` 內執行（NFR-2）。
- 「取代」依 FR-4：代號相符時只更新姓名、代號不變；姓名相符時只更新代號、姓名不變——**不是**兩欄都覆寫成匯入值。
- 呼叫端只送已勾選的 selections（見技術決策記錄第 5 項），函式本身不需要再過濾「有沒有勾選」這件事，只管「傳進來的就是要處理的」（AC-9 的「未勾選不產生異動」由前端負責不送出即可保證，見 T-9）。
- 交易內任一筆撞到 `employeeId` unique constraint（例如取代目標的新代號恰好被某位離職人員占用，這是分類階段沒有檢查的邊界，見技術決策記錄第 6 項）時，比照 `persons.ts` 既有的 `isPrismaUniqueConstraintError` 慣例轉成 `AppError(409, ...)`，讓整筆交易 rollback、不留下部分套用的髒資料。
- 測試層級：資料/邏輯行為，DB-backed 測試。AC-10 需比照 `docs/testing.md`「AttendanceRecord is keyed by personId」一節的既有測試手法：建立一位有出勤紀錄的人員、執行取代、重新透過 `getFormWithRecords`/`queryAttendanceByMonth` 或直接查 `AttendanceRecord` 確認 `personId` 未變、代號已更新。

AC 摘要：
- AC-9 Then：系統只對已勾選項次執行對應動作（更新既有人員資料或建立新人員），未勾選項次不產生任何資料異動
- AC-10 Then：該筆現有人員的員工代號被更新為匯入值，姓名維持不變；該人員既有的出勤紀錄不受影響、仍可正常查詢
- AC-11 Then：預覽區塊關閉，資料庫沒有任何新增或更新，人員列表維持匯入前的狀態

---

#### T-4：`lib/auth.ts` 擴充支援多角色檢查 [(infra)]
refs: AC-12, AC-13, AC-14
估時: 1h
風險: 低 — 單純簽章擴充，但屬於 `docs/auth.md` 明訂「所有權限判斷集中在 `lib/auth.ts`」（NFR-3）的唯一改動點，三條 AC（既有兩支路由放寬＋新路由）都靠這個改動落地。

實作重點：
- `requireRole` 目前簽章是 `requireRole(role: UserRole)`，只接受單一角色、做 `!==` 比對（`src/lib/auth.ts:57`）。擴充為可接受 `UserRole | UserRole[]`，陣列時只要符合其中一個即通過，維持現有呼叫端 `requireRole("developer")` 不必改寫。
- 不另外新增 `requireAnyRole` 這種平行函式（避免權限檢查邏輯散在 `auth.ts` 之外，違反 NFR-3 精神），理由詳見技術決策記錄第 2 項。
- 測試層級：資料/邏輯行為，`auth.test.ts`（如尚無則新增）覆蓋單一角色（既有行為不回歸）與陣列角色兩種呼叫方式。

AC 摘要：
- AC-12 Then：操作成功執行，不回傳權限錯誤（匯入套用）
- AC-13 Then：操作成功執行，不回傳權限錯誤（新增人員）
- AC-14 Then：操作成功執行，不回傳權限錯誤（設為離職）

---

#### T-5：既有人員新增／設為離職路由權限放寬
refs: AC-13, AC-14
估時: 0.5h
風險: 低 — 純參數替換，但要注意 `docs/auth.md` 目前明文把「person/category management」列為 developer 專屬（見該文件第 7 行），這次改動完成後**這段描述會過期**，commit 前需照 CLAUDE.md「commit 前檢查目標專案 CLAUDE 設定是否過期」一併修正 `docs/auth.md`，不能只改 code。

實作重點：
- `src/app/api/persons/route.ts` 的 `POST`：`requireRole("developer")` → `requireRole(["foreman", "developer"])`。
- `src/app/api/persons/[employeeId]/route.ts` 的 `DELETE`：同上。
- `GET /api/persons`（`route.ts` 第 6-11 行）目前是 `requireAuth()`，維持不變（spec 沒有要求放寬或收緊讀取權限）。
- 測試層級：路由層級 401/403 測試，比照 `docs/testing.md`「When a route-level test is worth it」慣例：確認 `foreman` 呼叫這兩支端點不再回 403，`developer` 行為不變（回歸測試），未登入仍 401。

AC 摘要：
- AC-13 Then：操作成功執行，不回傳權限錯誤
- AC-14 Then：操作成功執行，不回傳權限錯誤

---

#### T-6：新增匯入預覽 API route（`POST /api/persons/import/preview`）
refs: AC-2, AC-3, AC-4, AC-5, AC-6, AC-7（NFR-1）
估時: 2h
風險: 中 — 這支路由是 NFR-1「預覽階段不得寫入資料庫」的稽核重點，需要在 code review／測試層面明確確認檔案裡完全沒有 `prisma.person.create`/`prisma.person.update` 呼叫。

實作重點：
- 接收上傳檔案（`multipart/form-data` 或前端先轉 base64／ArrayBuffer 皆可，依 Next.js Route Handler 慣例挑一種，於 task 內定案），呼叫 T-1 的 `parseSftReport` + T-2 的 `classifyImportRows`，回傳分類後的預覽陣列（含每筆的分類標籤、現有值/匯入值對照、可否勾選）。
- 權限沿用與「匯入套用」相同的 `requireRole(["foreman", "developer"])`——spec FR-8 只明講「匯入套用」的權限，沒提到「產生預覽」本身要不要一併控管，這是 planner 補的合理假設，理由見技術決策記錄第 4 項，不是既有限制被打破，故不需要走衝突事項流程。
- 測試層級：路由層級測試，401/403（沿用 `docs/testing.md` 慣例）＋一則整合測試明確斷言「呼叫此路由前後 `prisma.person.count()` 不變」，把 NFR-1 落實成可執行的回歸測試，而不是只靠 code review。

AC 摘要：
- AC-2 Then：預覽清單出現一筆標示「取代」的項次，顯示該人員現有的員工代號與匯入的員工代號
- AC-3 Then：預覽清單出現一筆標示「取代」的項次，顯示該人員現有的姓名與匯入的姓名
- AC-4 Then：該筆資料不出現在預覽清單中
- AC-5 Then：預覽清單出現一筆標示「新增」的項次，顯示匯入的員工代號與姓名
- AC-6 Then：該筆資料的比對結果視為與在職人員皆不相符
- AC-7 Then：預覽清單出現一筆標示「無法匯入」的項次，附上衝突原因，該項次的勾選框為停用狀態

---

#### T-7：新增匯入套用 API route（`POST /api/persons/import/apply`）
refs: AC-9, AC-10, AC-12（NFR-2）
估時: 2h
風險: 中 — 需正確串接 T-3 的交易邏輯與 T-4 的角色檢查，並決定錯誤時（例如 T-3 提到的 unique constraint 撞號）回傳給前端的訊息格式。

實作重點：
- `requireRole(["foreman", "developer"])`（AC-12/FR-8）。
- 接收前端已勾選的 selections（見技術決策記錄第 5 項：前端只送已勾選項次，不送整包由後端過濾），呼叫 T-3 的 `applyImportSelections`。
- 測試層級：路由層級測試，401/403 + 一則整合測試確認「只傳部分 selections 時，資料庫只對這些筆數產生異動」，把 AC-9 在路由這一層也覆蓋一次（T-3 已在 lib 層驗證核心邏輯，這裡是確認路由沒有把完整清單誤傳進去）。

AC 摘要：
- AC-9 Then：系統只對已勾選項次執行對應動作，未勾選項次不產生任何資料異動
- AC-10 Then：該筆現有人員的員工代號被更新為匯入值，姓名維持不變；出勤紀錄不受影響
- AC-12 Then：操作成功執行，不回傳權限錯誤

---

#### T-8：前端 — 匯入入口與檔案上傳 UI（FR-1）
refs: AC-1
估時: 2h
風險: 低 — 純新增一個檔案選擇區塊，沿用頁面既有的行內展開風格（不使用彈窗），排版本身不涉及複雜 CSS layout。

實作重點：
- 於 `src/app/persons/page.tsx` 既有「新增人員」`<form>`（第 71-87 行）下方、`<table>`（第 89 行）上方新增「匯入 SFT 報表」檔案選擇入口（FR-1 位置要求）。
- 選檔後呼叫 T-6 的 preview API（`authFetch`），成功則展開預覽區塊（交給 T-9），失敗顯示錯誤訊息（沿用頁面既有 `error-box` pattern）。
- 測試層級：AC-1 的 Then（「畫面顯示...入口，位於...下方、...上方」）是純 UI 渲染/位置斷言，規劃 component test（Vitest + React Testing Library，jsdom）：mock `authFetch`，斷言檔案輸入元素存在且在 DOM 順序上位於新增人員表單之後、人員列表之前。專案已有 jsdom + RTL 慣例（`docs/testing.md` 的 attendance-scoring-rules／score-query 段落，`test/jsdom-setup.ts`），沿用即可，不需要另外建立這層環境。

AC 摘要：
- AC-1 Then：畫面顯示「匯入 SFT 報表」檔案選擇入口，位於既有新增人員表單下方、人員列表上方

---

#### T-9：前端 — 預覽清單 UI（行內表格、勾選、確認套用／取消）
refs: AC-2, AC-3, AC-5, AC-7, AC-8, AC-9, AC-11
估時: 4h
風險: 中 — 狀態較多（分類標籤、勾選狀態、停用狀態、送出後重整列表），且是本次唯一大量集中 UI 邏輯斷言的 task。

實作重點：
- 行內表格呈現 T-6 回傳的預覽陣列：分類標籤（取代／新增／無法匯入）、現有資料與匯入資料對照、勾選框（FR-5）。
- 勾選框預設 `false`（AC-8）；「無法匯入」項次的勾選框 `disabled`（FR-5/AC-7）。
- 「確認套用」把目前勾選中的項次（filter 出 `checked === true` 的）送給 T-7 的 apply API；「取消」只清空本地預覽狀態，不發任何請求（AC-11）。
- 這幾條 AC 的 Then 描述的都是「畫面上看不看得到某元素／某狀態」（標籤文字、checkbox 勾選與否、disabled 與否）而非真實排版或跨頁流程，component test（jsdom）足以驗證，**不需要 Playwright**：本次沒有涉及像素量測、真實捲動或跨頁導覽的斷言，且專案目前也沒有 `playwright.config.ts`，不需要為此另外建立瀏覽器測試環境。
- 測試層級：component test（Vitest + RTL，jsdom），mock `authFetch` 回傳固定的分類結果陣列，逐一斷言：取代/新增項次文字與欄位對照正確渲染（AC-2/AC-3/AC-5）、無法匯入項次的 checkbox 為 disabled 且顯示衝突原因（AC-7）、所有可勾選項次初始為未勾選（AC-8）、勾選部分項次後點「確認套用」送出的 request body 只含被勾選的項次（AC-9，UI 層的輔助驗證，核心邏輯由 T-3/T-7 的 DB-backed 測試把關）、點「取消」後預覽區塊消失且未呼叫 apply API（AC-11）。

AC 摘要：
- AC-2 Then：預覽清單出現一筆標示「取代」的項次，顯示該人員現有的員工代號與匯入的員工代號
- AC-3 Then：預覽清單出現一筆標示「取代」的項次，顯示該人員現有的姓名與匯入的姓名
- AC-5 Then：預覽清單出現一筆標示「新增」的項次，顯示匯入的員工代號與姓名
- AC-7 Then：預覽清單出現一筆標示「無法匯入」的項次，附上衝突原因，該項次的勾選框為停用狀態
- AC-8 Then：每一筆可勾選的項次（取代、新增）預設皆為「未勾選」狀態
- AC-9 Then：系統只對已勾選項次執行對應動作，未勾選項次不產生任何資料異動
- AC-11 Then：預覽區塊關閉，資料庫沒有任何新增或更新，人員列表維持匯入前的狀態

---

## 執行順序

1. T-1（xls 解析依賴 + 檔案讀取工具）與 T-4（`auth.ts` 多角色擴充）可並行，兩者互不依賴。
2. T-2（比對分類邏輯）— 依賴 T-1。
3. T-5（既有路由權限放寬）— 依賴 T-4，可與 T-2 並行。
4. T-3（套用邏輯）— 依賴 T-2 定義的分類結果型別（也可與 T-2 部分並行，但建議先有 T-2 的資料結構再動工，減少介面變動）。
5. T-6（預覽 API route）— 依賴 T-1、T-2、T-4。
6. T-7（套用 API route）— 依賴 T-3、T-4。
7. T-8（前端上傳入口）— 依賴 T-6（呼叫 preview API）。
8. T-9（前端預覽清單 UI）— 依賴 T-6、T-7、T-8。

建議順序：T-1 / T-4（並行）→ T-2 / T-5（並行）→ T-3 → T-6 → T-7 → T-8 → T-9。

---

## 技術決策記錄

1. **xls 解析套件選用 `xlsx`（SheetJS）**：專案目前無任何 xls/xlsx 解析依賴（`package.json` 確認過），需新增一顆套件。選 `xlsx` 是因為它是最通用、對 `.xls`（BIFF8 二進位格式，spec 已確認的格式）與 `.xlsx` 都有讀取支援的套件，本次只用其 `read`/`sheet_to_json`（唯讀），不涉及寫入，降低套件行為面的風險。
2. **`requireRole` 簽章擴充為 `UserRole | UserRole[]`，而非另開 `requireAnyRole`**：`docs/auth.md` 明文要求「所有權限判斷集中在 `lib/auth.ts`」（NFR-3），新增一支平行函式會讓權限檢查邏輯分裂成兩套語意相近但獨立維護的程式碼，改用同一函式擴充參數型別更符合既有慣例，且不影響現有呼叫端 `requireRole("developer")` 的行為。
3. **匯入預覽與匯入套用拆成兩支獨立路由**（`/api/persons/import/preview`、`/api/persons/import/apply`），不是同一支路由帶 `mode` 參數：讓 NFR-1「預覽階段不得呼叫 create/update」在檔案層級就結構性成立（preview route 的原始碼實體上不會 import 任何寫入函式），比起在單一路由裡用 if/else 分流、需要額外小心維持這個約束更不容易犯錯。
4. **匯入「預覽」動作的權限，沿用與「匯入套用」相同的 `foreman + developer`**：spec FR-8 只明講「匯入套用」需要角色限制，沒提到單純「上傳檔案產生預覽」這個動作本身要不要控管。因為預覽內容會揭露其他在職/離職人員的姓名與代號對照，開放給比 `foreman` 權限更低的角色（目前系統只有這兩種角色，所以實務上等同「所有登入者皆可」）並不合理，故沿用同一組角色門檻。這不影響任何既有系統行為（`/api/persons/import/preview` 是全新路由），不屬於需要走「衝突事項」流程的情況，僅記錄為此處的合理假設。
5. **前端只送出已勾選的 selections 給 apply API，而非送出整份清單讓後端過濾「勾選與否」**：讓「哪些項次要套用」這個決策完全落在前端狀態，後端 `applyImportSelections`（T-3）不需要重新理解「已勾選」的語意，職責更單純（拿到什麼就處理什麼），也讓 AC-9「未勾選不產生任何異動」在後端測試裡天然成立（未勾選的項次根本不會出現在 request body 裡）。
6. **「取代」項次的新員工代號，理論上仍可能撞到某位離職人員既有的代號**：spec FR-3/AC-7 明確定義的衝突檢查只涵蓋「新增」候選（代號與姓名皆不符 → 檢查代號是否被離職人員佔用），沒有涵蓋「取代」候選（例如 AC-2：姓名相符、代號不符）的新代號是否也可能撞到某位離職人員。`Person.employeeId` 是全域 `@unique`（`prisma/schema.prisma` 第 47 行，不分在職/離職），若真的撞到，`prisma.person.update` 會丟 `P2002`。決定不在分類階段（T-2）額外加規則去檢查這個情況——這跟 spec Out of Scope 明列的其他邊界情況（同報表重複指向同一人、一筆同時符合兩位不同的人）性質相近，都是低機率的邊界案例；改為在套用階段（T-3）比照 `src/lib/persons.ts` 既有 `createPerson` 的 `isPrismaUniqueConstraintError → AppError(409)` 慣例接住，讓交易乾淨 rollback、給出明確錯誤訊息，不會是未預期的 500。這不是打破既有限制，`employeeId` 唯一鍵維持原樣不變，只是補一個既有慣例已經覆蓋過的錯誤處理路徑。
7. **`AttendanceRecord.personId` 指向 `Person.id`（surrogate key）而非 `employeeId`**：已於 `prisma/schema.prisma` 第 260-263 行的既有註解、以及 `docs/testing.md`「AttendanceRecord is keyed by personId, not employeeId」一節確認——這正是 `docs/2026-07-31-attendance-record-personid-migration` 這個先前功能刻意做的設計，目的就是讓 `Person.employeeId`/`name` 之後可以被更正而不影響任何 `AttendanceRecord` 列。AC-10「取代不影響出勤歷史」的技術基礎確認成立，T-3 只需要照既有慣例（`prisma.person.update({ where: { employeeId } })`）操作即可，不需要處理 `AttendanceRecord`。

## 衝突事項

（無）本次規劃過程沒有發現 spec 假設跟既有系統設計衝突的情況。FR-7/FR-8 要求的權限放寬（developer-only → foreman + developer）雖然會讓 `docs/auth.md` 現有描述過期，但這是 spec 明確、已確認的核心需求（FR-7/FR-8 + AC-12/13/14），不是某條 AC 隱含帶出的副作用，屬於 commit 前「檢查目標專案 CLAUDE 設定是否過期」的範圍（見 T-5 風險欄），不需要走衝突事項的人工確認流程。
