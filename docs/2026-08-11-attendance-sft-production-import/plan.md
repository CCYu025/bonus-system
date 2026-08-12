# 出勤表單匯入 SFT 生產日報表 — 實作計畫

來源：`docs/2026-08-11-attendance-sft-production-import/spec.md`（已確認，2026-08-11）

> **修訂記錄（2026-08-11）**：spec.md 的 AC-3／AC-4／AC-5／AC-12 已修訂為「不依生產日期過濾，僅依員工代號＋姓名比對整份檔案」（原因：夜班跨日，見 spec.md 修訂記錄）。以下 T-1 任務內容（含 AC 摘要）保留原始規劃版本供追溯，**與目前程式碼行為不符**——`parseAttendanceSftReport` 已移除 `targetDate` 參數與所有日期比對邏輯，實際實作與測試以 `src/lib/attendance-import.ts`／`src/lib/attendance-import.test.ts` 現況與 spec.md 最新版本為準。

## Traceability Table（AC → Task 對照）

| AC ID | AC 標題 | Task ID(s) |
|-------|---------|-----------|
| AC-1  | 按鈕位置與可見性 | T-4 |
| AC-2  | 其餘狀態不可匯入（前端） | T-4 |
| AC-3  | 依生產日期過濾 | T-1 |
| AC-4  | 表頭定位與重複表頭列跳過 | T-1 |
| AC-5  | 依員工代號加總數量 | T-1 |
| AC-6  | 有效出勤類別以未儲存編輯為準 | T-2, T-3, T-6 |
| AC-7  | 非目標類別歸為 skippedWrongCategory | T-2, T-5 |
| AC-8  | 完全比對成功（matched） | T-2, T-6 |
| AC-8a | 加總結果為 0 或異常值時直接套用，不做特殊處理 | T-2, T-6 |
| AC-9  | 工號符合、姓名不符 → 需人工確認 | T-2, T-5 |
| AC-10 | 姓名符合、工號不符 → 需人工確認 | T-2, T-5 |
| AC-11 | 工號與姓名對應到不同人（衝突）→ 需人工確認 | T-2, T-5 |
| AC-12 | 查無報表資料維持原值 | T-2, T-5 |
| AC-13 | 報表資料在表單中完全找不到對應 | T-2, T-5 |
| AC-14 | 覆蓋既有數值需標示 | T-5 |
| AC-15 | 匯入 API 為唯讀，不寫入資料庫 | T-3 |
| AC-16 | 確認套用後仍須手動存檔 | T-6 |
| AC-17 | 表單狀態限制（後端） | T-3 |
| AC-18 | 權限沿用既有編輯權限 | T-3 |
| AC-19 | 手動上傳，非自動監看資料夾 | T-4 |
| NFR-1 | 匯入 API 不得寫入資料庫 | T-3 |
| NFR-2 | 檔案格式無法解析時回傳明確錯誤 | T-1 |
| NFR-3 | 後端驗證有效出勤類別 payload 僅限本表單人員/合法 categoryId | T-3 |

---

## Tasks

#### T-1：Excel 解析、日期過濾、依員工代號加總（FR-3／FR-4／FR-5）
refs: AC-3, AC-4, AC-5（NFR-2 一併於此任務把關）
估時: 3h
風險: 中 — 「生產日期」欄位在真實 SFT 匯出檔中可能是純文字（如既有 `parseSftReport` 測試 fixture用的 `"2026-08-06"`）或 Excel 日期序列值，兩種都要能正確比對；且目前專案內沒有一份同時含「生產日期」「數量」欄位的真實樣本檔（既有 `docs/2026-08-07-person-import-sft/evidence/` 底下的樣本只涉及員工代號/姓名兩欄），需要自行建構測試 fixture，行為是否完全貼合真實匯出格式無法 100% 確認。

實作重點：
- 新增 `src/lib/attendance-import.ts`（不擴充既有 `src/lib/persons-import.ts`——兩者欄位集合與聚合語意不同，見技術決策記錄第 1 項），內含 `parseAttendanceSftReport(buffer: Buffer, targetDate: string): { employeeId: string; name: string; quantity: number }[]`。
- 表頭定位邏輯延續既有 `parseSftReport` 的「以內容找列」手法（`row.includes("員工代號") && row.includes("姓名")`），但同時要求該列含「生產日期」「數量」欄名才視為表頭（AC-4），並排除資料列中內容與表頭相同的殘留列。
- 日期比對：讀取儲存格值後統一轉字串比較（`String(cell).trim()`），若儲存格是 Excel 序列日期（`typeof cell === "number"`）則先用 `XLSX.SSF.parse_date_code` 或讀取 sheet 時帶 `cellDates: true` 轉成 `Date` 再格式化為 `YYYY-MM-DD`，兩條路徑都要有測試覆蓋（AC-3）。
- 加總：依「員工代號」分組加總「數量」欄，只加總已通過日期過濾的列；姓名取最後一次出現的值（同一員工代號多筆資料時姓名理論上一致，若不一致以最後一筆為準，比照既有 `parseSftReport` 的 dedupe 慣例）（AC-5）。
- 找不到表頭列或檔案無法讀取時，沿用既有風格丟出 `AppError(400, "檔案格式無法解析")`（NFR-2）。
- 測試層級：資料/邏輯行為，沿用既有 pytest 慣例（Vitest + `XLSX.utils.aoa_to_sheet` 建構的 fixture，比照 `src/app/api/persons/import/preview/route.test.ts` 的 `buildFileRequest` 手法），不需要 DOM。覆蓋：表頭前有標題列＋資料中殘留重複表頭列（AC-4）、同時含多個生產日期只取目標日期（AC-3）、同一員工代號跨多筆資料列加總（AC-5）、生產日期為數字型 Excel 序列值的情境。

AC 摘要：
- AC-3 Then：僅使用「生產日期」欄位等於表單日期的資料列參與後續比對與加總，其餘日期的資料列不列入計算
- AC-4 Then：系統以內容定位真正的表頭列，並將殘留重複表頭列排除，不當成一筆有效資料參與加總
- AC-5 Then：該員工代號當天的加總結果，等於所有屬於該員工代號、且已通過生產日期過濾的資料列「數量」欄總和

---

#### T-2：五類分類核心邏輯（FR-6／FR-7）
refs: AC-6, AC-7, AC-8, AC-8a, AC-9, AC-10, AC-11, AC-12, AC-13
估時: 3h
風險: 中 — 分支數量多（matched／needsReview 三種成因／skippedWrongCategory／noExcelData／unmatchedInExcel），且存在 spec 沒有逐條列出的交叉情境（例如：某人員自己的員工代號不在報表中〔應歸 noExcelData〕，但報表另一筆資料的姓名剛好與這位人員同名〔該筆報表資料同時會被歸類為 needsReview 候選〕）——需要明確定義排除規則，避免同一人在畫面上重複出現於兩個分類清單。

實作重點：
- 於 `src/lib/attendance-import.ts` 新增 `classifyAttendanceImportRows(reportRows, formPersons, targetCategoryCodes)`，設計為**不查詢 DB 的純函式**（見技術決策記錄第 3 項）：
  - `reportRows`：T-1 輸出的 `{ employeeId, name, quantity }[]`。
  - `formPersons`：呼叫端（T-3）已組好的 `{ personId, employeeId, name, effectiveCategoryCode }[]`（`effectiveCategoryCode` 是呼叫端合併「前端傳入的 categoryId」與「categories 清單」後解析出的類別代碼，例如 `NORMAL`／`HOLIDAY_OVERTIME`／其他，null 視為「未選」）。
  - `targetCategoryCodes`：固定 `["NORMAL", "HOLIDAY_OVERTIME"]`（對應 `scripts/seed.cjs` 的既有類別代碼，見 `docs/database.md`）。
- 判定順序（以每筆 `reportRow` 為主體）：
  1. `byCode` = `formPersons` 中 `employeeId` 相符者；`byName` = `formPersons` 中 `name` 相符者。
  2. 若 `byCode` 存在：
     - `byCode.effectiveCategoryCode` 不屬於 `targetCategoryCodes` → `skippedWrongCategory`（AC-7，不檢查姓名是否相符，Given 只要求代號查有資料）。
     - 屬於 target 類別，且 `byName` 也存在、`byName.personId === byCode.personId` → `matched`（AC-8/AC-8a：加總結果無論是 0、非整數或負值都原樣帶出，不做任何 round/clamp/排除）。
     - 屬於 target 類別，但 `byName` 不存在或指向不同 `personId` → `needsReview`：`byName` 不存在或 `byName.personId === byCode.personId` 時視為 AC-9（僅代號符合候選 `byCode`）；`byName` 存在且是不同人時視為 AC-11（雙候選 `byCode`＋`byName`）。
  3. 若 `byCode` 不存在但 `byName` 存在 → `needsReview`，AC-10（僅姓名符合候選 `byName`），不檢查 `byName` 的類別（呈現邏輯與 AC-9 一致，交給人工判斷）。
  4. 兩者皆不存在 → `unmatchedInExcel`（AC-13）。
- 處理完所有 `reportRows` 後，計算 `noExcelData`：`formPersons` 中 `effectiveCategoryCode` 屬於 target 類別、且**沒有任何 `reportRow.employeeId` 等於自己 `employeeId`** 的人員（AC-12）——刻意只用 `employeeId` 存在與否判斷，不管步驟 3 是否已經把這個人列成某筆 `reportRow` 的 `needsReview` 候選（同一人 `employeeId` 不在報表中、但姓名恰好被另一筆報表資料點名為候選，維持「兩邊都列出」，不互相排除——spec 沒有規定互斥，這是本任務明確補上的實作假設，記錄於技術決策記錄第 4 項，不算打破任何 AC）。
- 回傳結構：`{ matched: {...}[], needsReview: {...}[], skippedWrongCategory: {...}[], noExcelData: {...}[], unmatchedInExcel: {...}[] }`，`needsReview` 項目需帶 `candidates: { personId, employeeId, name, matchedBy: "employeeId" | "name" }[]`（1 筆或 2 筆），供 T-5 呈現候選人姓名。
- 測試層級：資料/邏輯行為。因為函式本身不碰 DB，比照 `docs/testing.md` 的 `filters.ts`/`display.ts` 慣例，用純 Vitest（不需要 `resetDb()`）直接餵入手造的 `reportRows`/`formPersons` 陣列，逐一覆蓋 AC-7～AC-13（含 AC-8a 的 0／負值／非整數情境）以及上述「noExcelData 與 needsReview 候選重疊」的交叉案例。

AC 摘要：
- AC-6 Then：系統以畫面上當下（尚未儲存）的有效出勤類別判斷該人員是否為匯入對象，而非資料庫中已存的舊值
- AC-7 Then：該人員歸類為 skippedWrongCategory，不自動套用數量
- AC-8 Then：該人員歸類為 matched，其加總後的產量數字於使用者確認後寫入前端 edits state 的實際產量欄位
- AC-8a Then：系統照樣將加總結果原值寫入前端 edits state，不做四捨五入、排除、歸零或另行分類；不符合既有正整數驗證則沿用既有儲存驗證機制擋下
- AC-9 Then：該筆歸類為 needsReview，不自動套用數量；確認摘要清單顯示報表原始工號／姓名／加總數量，以及對應到表單中的候選人員姓名
- AC-10 Then：該筆歸類為 needsReview，不自動套用數量，呈現方式與 AC-9 相同
- AC-11 Then：該筆歸類為 needsReview，確認摘要同時列出候選人 A 與候選人 B，不自動套用數量
- AC-12 Then：該人員歸類為 noExcelData，其「實際產量」欄位維持原值不變
- AC-13 Then：該筆歸類為 unmatchedInExcel，於確認摘要中列出僅供告知，不影響表單任何欄位

---

#### T-3：匯入 API route（`POST /api/forms/[id]/import-sft`）
refs: AC-6, AC-15, AC-17, AC-18（NFR-1／NFR-3 一併於此任務把關）
估時: 2.5h
風險: 低～中 — 邏輯核心已在 T-1/T-2 覆蓋，這裡主要是串接既有 `requireAuth`／表單狀態檢查與新增的 NFR-3 payload 驗證；風險點在於 NFR-3 要求「不可讓請求內容指定表單以外的人員或不存在的 categoryId」，需要明確定義非法輸入的錯誤回應，不能讓分類邏輯把非法輸入誤吸收成某個分類結果。

實作重點：
- 權限：`await requireAuth()`（不額外呼叫 `requireRole`），與既有 `PATCH /api/forms/[id]/records`（`src/app/api/forms/[id]/records/route.ts`）完全一致的呼叫方式，落實 FR-12「不另外放寬或收緊」；`docs/auth.md` 目前的角色模型下沒有任何角色會被這支既有路由拒絕，AC-18 的測試因此以「未登入回 401」＋程式碼審查確認呼叫點與 `records` 路由相同（同一函式、無額外 `requireRole`）作為驗證方式，而非依賴一個目前系統中並不存在的「無權限角色」情境。
- 表單狀態檢查：`assertEditable` 目前是 `src/lib/forms.ts` 內未導出的私有函式（第 10-17 行），改為 `export function assertEditable`，這支新路由與既有 `saveFormRecords`/`submitForm` 共用同一份 `EDITABLE_STATUSES` 判斷，避免兩處維護兩份「draft/rejected 才可編輯」的清單而漂移（AC-17）。
- 請求格式：`multipart/form-data`，欄位 `file`（Excel 檔）＋ `effectiveCategories`（JSON 字串，`{ [employeeId]: categoryId | null }`，涵蓋畫面上目前顯示的每一位人員，FR-9）。
- NFR-3 驗證：查詢 `getFormWithRecords(formId)` 取得本表單目前的人員清單（`records[].employeeId`）與 `prisma.attendanceCategory.findMany()` 取得合法 `categoryId` 集合；`effectiveCategories` 的 key 若出現不在本表單人員清單中的 `employeeId`，或 value 是不存在於合法集合中的 `categoryId`，一律 `AppError(400, "有效出勤類別資料不合法")`，不進入分類流程。
- 組出 T-2 需要的 `formPersons`：以表單人員清單為準（不是以 `effectiveCategories` 的 key 為準，避免請求少傳某人時被排除出「查無報表資料」判斷），`effectiveCategoryCode` = 若 `effectiveCategories` 有該 `employeeId` 的值則用該值查 `categoryId → code`；沒有則以該人員表單目前已存的 `categoryId` 為準（AC-6 的「若該人員無未儲存編輯則以表單已存的類別為準」）。
- 依序呼叫 T-1 的 `parseAttendanceSftReport(buffer, form.date)` 與 T-2 的 `classifyAttendanceImportRows`，回傳分類結果 JSON。全程不呼叫任何 `prisma.*.create`/`update`/`delete`/`upsert`（AC-15/NFR-1）。
- 測試層級：路由層級測試（比照 `docs/testing.md`「When a route-level test is worth it」與既有 `src/app/api/persons/import/preview/route.test.ts` 的手法）：401（無 session）、`pending_review`/`approved`/`voided` 狀態回拒（AC-17）、`effectiveCategories` 帶入表單以外的 `employeeId` 或不存在的 `categoryId` 回 400（NFR-3）、呼叫前後 `prisma.attendanceForm.findUnique`/`attendanceRecord.findMany` 讀到的資料完全不變（AC-15，比照既有 preview route test 的「呼叫前後 count 不變」手法）。

AC 摘要：
- AC-6 Then：系統以畫面上當下（尚未儲存）的有效出勤類別判斷該人員是否為匯入對象，而非資料庫中已存的舊值
- AC-15 Then：資料庫中此表單的任何欄位皆未被修改；匯入 API 全程未執行任何資料庫寫入操作
- AC-17 Then：系統拒絕該請求並回傳明確錯誤，不論前端按鈕是否已隱藏或停用
- AC-18 Then：系統拒絕該請求，權限檢查結果與呼叫既有 PATCH /api/forms/:id/records 時一致

---

#### T-4：前端 — 匯入按鈕與檔案上傳入口（FR-1／FR-2）
refs: AC-1, AC-2, AC-19
估時: 2h
風險: 低 — 純新增一個按鈕與原生檔案選取，沿用頁面既有按鈕群組排版，不涉及複雜 CSS layout。

實作重點：
- 於 `src/app/forms/[id]/page.tsx` 既有按鈕群組（第 569-605 行 `<div className="inline-form">`）內，`editable` 區塊的「儲存草稿」按鈕之前新增「匯入SFT生產日報表」按鈕，維持三顆按鈕由左至右順序：匯入SFT生產日報表／儲存草稿／確認送出待審（FR-1/AC-1）；按鈕僅在 `editable`（`draft`/`rejected`）為真時渲染，其餘狀態（`pending_review`/`approved`/`voided`）不顯示（AC-2）。
- 按鈕觸發一個隱藏的 `<input type="file" accept=".xls,.xlsx" />`（`ref` + `click()`），選檔後才呼叫 T-3 的 API——不使用彈窗式檔案總管模擬、不 poll 任何固定路徑，滿足 AC-19「呈現的是檔案選擇上傳介面」；程式碼裡不得出現任何 `setInterval`/檔案系統路徑監看邏輯。
- 選檔並呼叫 API 成功後，把回傳的五類分類結果存進新的 state（例如 `importPreview`），交給 T-5 渲染；失敗時沿用既有 `error-box` pattern 顯示錯誤訊息。
- 測試層級：AC-1（按鈕順序）與 AC-2（其餘狀態不可見/停用）都是「畫面上有沒有渲染某元素、DOM 順序」的斷言，規劃 component test（Vitest + React Testing Library，jsdom）。專案已有這層慣例（`docs/testing.md`「攻atendance-scoring-rules」一節、`test/jsdom-setup.ts`、`src/app/score-rules/page.test.tsx`），沿用即可；mock `authFetch`，不需要真的呼叫 API。AC-19 的「不自動監看資料夾」用程式碼審查（確認沒有 interval/自動輪詢邏輯）＋ component test 斷言「掛載時不會自動觸發任何上傳請求」共同覆蓋，不需要 Playwright（不涉及真實檔案系統存取，jsdom 驗得到）。

AC 摘要：
- AC-1 Then：「匯入SFT生產日報表」按鈕顯示在「儲存草稿」按鈕左側，三個按鈕由左至右順序為：匯入SFT生產日報表／儲存草稿／確認送出待審
- AC-2 Then：不顯示「匯入SFT生產日報表」按鈕，或按鈕呈停用狀態，無法觸發匯入
- AC-19 Then：呈現的是檔案選擇上傳介面（如檔案選取對話框），系統不會自動讀取或監看任何本機／雲端固定資料夾路徑

---

#### T-5：前端 — 確認摘要畫面呈現五類分類結果（FR-10）
refs: AC-7, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14
估時: 3h
風險: 中 — 畫面狀態種類多（五種分類各自的呈現方式＋覆蓋標示），是本次唯一大量集中 UI 呈現斷言的 task，且 AC-14 的「將被覆蓋」判斷需要正確比對 T-3 回傳的 `matched.quantity` 與畫面上當下的 `actualQuantity`（來自 `edits` state 或 `record.actualQuantity`，兩者都可能是「非空值」的來源，見 AC-14 Given）。

實作重點：
- 以 T-4 存下的 `importPreview` 渲染一個確認摘要區塊（沿用頁面既有行內展開風格，不使用彈窗）：
  - `matched`：逐筆顯示工號／姓名／加總後產量；若該人員目前顯示的 `actualQuantity`（透過既有 `getFieldValue(r, "actualQuantity")` 邏輯，涵蓋已存檔值與本次會話已輸入未存檔值）非空，標示「將被覆蓋」並同時顯示原值與新值（AC-14）；為 0 或非正整數的加總結果不做任何特殊樣式或排除，比照一般數字呈現（AC-8a）。
  - `needsReview`：逐筆顯示報表原始工號／姓名／加總數量，以及 `candidates` 內每個候選人員的姓名（1 位或 2 位）（AC-9/AC-10/AC-11 呈現方式相同，僅候選人數量不同）。
  - `skippedWrongCategory`：逐筆顯示工號／姓名／目前出勤類別，純告知不可勾選（AC-7）。
  - `noExcelData`：逐筆顯示工號／姓名，並註明「維持原值」（AC-12）。
  - `unmatchedInExcel`：逐筆顯示報表工號／姓名／加總數量，純告知（AC-13）。
- 這幾條 AC 的 Then 描述的都是「畫面上有沒有出現某段文字/某個分類清單」而非真實排版、像素量測或跨頁流程，component test（jsdom）足以驗證，**不需要 Playwright**：專案目前也沒有 `playwright.config.ts`，不需要為此另外建立瀏覽器測試環境。
- 測試層級：component test（Vitest + RTL，jsdom），mock `authFetch` 回傳固定的五類分類結果（涵蓋每一類至少一筆，`matched` 內至少一筆命中「將被覆蓋」、一筆是全新填入），逐一斷言對應文字/欄位是否正確渲染。

AC 摘要：
- AC-7 Then：該人員歸類為 skippedWrongCategory，不自動套用數量
- AC-9 Then：該筆歸類為 needsReview，不自動套用數量；確認摘要清單顯示報表原始工號／姓名／加總數量，以及對應到表單中的候選人員姓名
- AC-10 Then：該筆歸類為 needsReview，不自動套用數量，呈現方式與 AC-9 相同
- AC-11 Then：該筆歸類為 needsReview，確認摘要同時列出候選人 A 與候選人 B，不自動套用數量
- AC-12 Then：該人員歸類為 noExcelData，其「實際產量」欄位維持原值不變
- AC-13 Then：該筆歸類為 unmatchedInExcel，於確認摘要中列出僅供告知，不影響表單任何欄位
- AC-14 Then：該筆標示為「將被覆蓋」，並同時顯示原值與即將套用的新值；使用者確認套用後才實際覆蓋前端 edits state 中的值

---

#### T-6：前端 — 確認套用寫入 edits state（FR-9／FR-10）
refs: AC-6, AC-8, AC-8a, AC-16
估時: 2.5h
風險: 中 — 需要正確合併兩份資料來源：呼叫 T-3 API 時要送出「畫面上當下每位人員的有效出勤類別」（優先用 `edits` state，沒有才退回 `record.categoryId`，AC-6）；確認套用時要把 `matched` 清單的數量寫回 `edits` state 而不觸發任何存檔請求（AC-16）——兩處都吃同一份 `edits`/`records` 資料，容易顧此失彼。

實作重點：
- 觸發匯入時，組出 `effectiveCategories`：對 `form.records` 逐一取 `edits[employeeId]?.categoryId ?? r.categoryId`（與現有 `getFieldValue(r, "categoryId")` 同一套規則），序列化後與檔案一起送給 T-3 的 API（FR-9/AC-6）。
- 「確認套用」按鈕：把 `importPreview.matched` 內每一筆的 `quantity`，透過現有 `setField(r, "actualQuantity", quantity)` 寫入 `edits` state（重用既有的 `setField`，不另外寫一套 state 更新邏輯，維持與既有鎖定規則一致——若匯入當下該人員的出勤類別已被切到鎖定類，`setField` 既有邏輯會自然處理清空，不需要額外分支）；`quantity` 為 0 或非正整數時原樣寫入，不做任何轉換（AC-8/AC-8a）。
- 套用後只更新本地 `edits` state 並關閉確認摘要區塊，**不**呼叫 `handleSave`／`/api/forms/:id/records`，資料庫維持不變，直到使用者自行按下「儲存草稿」或「確認送出待審」（AC-16，與既有 `handleSave` 流程完全解耦）。
- 測試層級：component test（Vitest + RTL，jsdom），mock `authFetch`：
  - 情境一（AC-6）：在畫面上把某人員出勤類別改成「正常出勤」但不按儲存，觸發匯入，斷言送給 import API 的 `FormData` 內 `effectiveCategories` 反映的是畫面上的新值而非該人員原本的 `categoryId`。
  - 情境二（AC-8/AC-8a）：mock import API 回傳含 0 與負值的 `matched` 項目，點擊確認套用後斷言對應輸入框顯示的值就是原樣的加總結果。
  - 情境三（AC-16）：確認套用後斷言未呼叫 `/api/forms/:id/records`（`authFetch` mock 未收到對應請求），且表格顯示的值仍是透過 `edits` state 呈現（未重新整理成伺服器回傳的 `form`）。

AC 摘要：
- AC-6 Then：系統以畫面上當下（尚未儲存）的有效出勤類別判斷該人員是否為匯入對象，而非資料庫中已存的舊值
- AC-8 Then：該人員歸類為 matched，其加總後的產量數字於使用者確認後寫入前端 edits state 的實際產量欄位
- AC-8a Then：系統照樣將加總結果原值寫入前端 edits state，不做四捨五入、排除、歸零或另行分類
- AC-16 Then：資料庫中的表單資料維持不變，變更僅存在於前端未儲存狀態，直到既有的儲存/送審流程被觸發

---

## 執行順序

1. T-1（Excel 解析/過濾/加總）與 T-4（前端按鈕與上傳入口）可並行，兩者互不依賴。
2. T-2（五類分類邏輯，純函式）— 依賴 T-1 定義的 `reportRows` 型別，可與 T-4 並行。
3. T-3（匯入 API route）— 依賴 T-1、T-2。
4. T-5（確認摘要畫面渲染）— 依賴 T-3（需要真實的分類結果 JSON 形狀）與 T-4（掛在同一個按鈕觸發的 state 上）。
5. T-6（確認套用寫入 edits state）— 依賴 T-3、T-5。

建議順序：T-1 / T-4（並行）→ T-2 → T-3 → T-5 → T-6。

---

## 技術決策記錄

1. **新增獨立的 `src/lib/attendance-import.ts`，不擴充既有 `src/lib/persons-import.ts`**：既有 `parseSftReport` 只解析「員工代號」「姓名」兩欄、以「最後一筆出現者為準」去重；本次需要額外解析「生產日期」「數量」兩欄，且聚合語意是「加總」而非「取最後一筆」。兩者欄位集合與聚合規則都不同，硬塞進同一支函式只會讓既有人員主檔匯入功能的呼叫端多背一份用不到的邏輯與參數，違反 spec Scope 明講的「與人員主檔匯入功能不重疊」，故分開檔案/函式。
2. **只新增一支唯讀 API（`POST /api/forms/[id]/import-sft`），不比照人員主檔匯入拆成 preview/apply 兩支路由**：AC-15/AC-16 已明講整個匯入流程（含使用者按下「確認套用」）都不寫資料庫，實際寫入是靠既有的「儲存草稿」/「確認送出待審」流程（`PATCH /api/forms/[id]/records`）完成，所以本次不需要一支「apply」路由——「確認套用」單純是前端把資料寫進 `edits` state，不是一次 API 呼叫。
3. **`classifyAttendanceImportRows` 設計為不查 DB 的純函式，DB 查詢與 payload 驗證放在 T-3 的路由層**：分類邏輯本身的輸入（報表列＋表單人員清單＋各自的有效類別代碼）與輸出都是資料轉換，不需要碰資料庫，比照 `docs/testing.md` 記載的 `filters.ts`/`display.ts` 慣例抽成純函式可以用最簡單的 Vitest（不需要 `resetDb()`）測完全部分支組合，執行更快、也更容易窮舉交叉案例。
4. **`noExcelData` 與「作為另一筆報表資料 needsReview 候選」允許同一人同時出現在兩邊**：spec AC-12 的判斷條件只寫「報表中查無此員工代號的任何資料列」，沒有講到「但姓名被報表另一筆資料點名」這種邊界情況要不要互斥排除。因為兩邊訊息對班長來說都有意義（「你自己的代號沒有資料」＋「有一筆姓名很像你的資料需要確認是不是打錯代號」），選擇兩邊都呈現而非互斥，這不影響任何一條 AC 的字面判定結果，是本任務為「spec 沒寫全的交叉案例」補的合理假設，不是打破既有系統限制，故不列入衝突事項。
5. **AC-14「將被覆蓋」的原值/新值比對，完全在前端算，後端 API 不需要接收或回傳目前的 `actualQuantity`**：後端只需要回傳 `matched` 清單的加總結果；「這筆匯入結果是否會覆蓋畫面上已有的非空值」這件事，前端本來就持有 `edits`/`records` 兩份可能來源的現值（既有 `getFieldValue` 已經封裝這個判斷），沒有必要讓後端 payload 再多帶一份重複資料，減少 NFR-3 需要驗證的欄位範圍。
6. **匯入 API 的權限維持只呼叫 `requireAuth()`，不新增 `requireRole`**：FR-12 明講「與既有表單記錄編輯權限一致，不另外放寬或收緊」，而既有 `PATCH /api/forms/[id]/records` 目前的實作就是只呼叫 `requireAuth()`，沒有額外角色限制（`docs/auth.md` 的角色模型下 `foreman`/`developer` 都能編輯表單記錄）。這裡刻意不引用 `requireRole(["foreman","developer"])`（人員主檔匯入功能用的那組），因為那是另一支路由（`/api/persons/import/*`）明確的權限決策，跟「表單記錄編輯權限」是兩件事，混用會實質上收緊或放寬本功能的權限，違反 FR-12。

## 衝突事項

（無）本次規劃過程沒有發現 spec 假設跟既有系統設計衝突的情況。FR-12／AC-18 要求「權限沿用既有表單記錄編輯權限」，經檢查 `PATCH /api/forms/[id]/records` 現況（只呼叫 `requireAuth()`，無額外角色限制）與 spec 假設一致，不需要打破任何既有限制；`src/lib/forms.ts` 的 `assertEditable` 私有函式改為 `export`（T-3）是單純的重構級改動，不改變其行為本身。
