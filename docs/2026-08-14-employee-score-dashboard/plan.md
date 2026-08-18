# 員工分數查詢儀表板 — 實作計畫

依據 `docs/2026-08-14-employee-score-dashboard/spec.md`（AC-CONFIRMED: 2026-08-14）規劃。

## Traceability Table（AC → Task 對照）

| AC ID | AC 標題 | Task ID(s) |
|-------|---------|-----------|
| AC-1  | 免登入可存取查詢頁 | T-2, T-3 |
| AC-2  | 頁面載入即顯示當月完整排行榜 | T-1, T-3, T-5 |
| AC-3  | 所選月份無資料時的明確提示 | T-1, T-3, T-5 |
| AC-4  | 點選人員開啟個人資訊彈窗 | T-7, T-12 |
| AC-5  | 分數與計算方式跟既有查詢頁一致 | T-1 |
| AC-6  | 免額外驗證 | T-1 |
| AC-7  | 瀏覽不建立登入狀態 | T-1, T-3 |
| AC-8  | 首頁維持登入才可見，並新增指向公開頁面的連結 | T-14 |
| AC-9  | 彈窗內顯示分數組成甜甜圈圖與置中總分（含負值處理） | T-8, T-9, T-12 |
| AC-10 | 彈窗明細表格可獨立捲動，表頭固定＋捲動陰影提示 | T-10, T-12 |
| AC-11 | 排行榜頁面顯示分數組成堆疊長條圖 | T-8, T-11 |
| AC-12 | 月份選擇器切換資料 | T-1, T-3, T-13 |
| AC-13 | 窄螢幕（觸控裝置）下的精簡清單與底部操作表 | T-4, T-6, T-7 |
| AC-14 | 寬螢幕（PC）下的完整欄位與置中對話框 | T-4, T-6, T-7 |
| AC-15 | 彈窗鍵盤操作與焦點管理 | T-7 |

（NFR-1/NFR-3 由 T-1、T-2 落實；NFR-2 由 T-1 的比對測試落實；NFR-4 由 T-6、T-7 落實，見各 task 實作重點。）

## Tasks

#### T-1：免登入查詢 API route [(infra)]
refs: AC-2, AC-3, AC-5, AC-6, AC-7, AC-12
估時: 3
風險: 低 — 直接複用既有 `queryScoresByMonth`，不新增計分邏輯

實作重點：
- 新增 `src/app/api/public/score-board/by-month/route.ts`：`GET`，解析 `month` query，直接呼叫 `queryScoresByMonth(month)`，**不**呼叫 `requireAuth`/`requireRole`；沿用 `withErrorHandling` 包裝慣例（比照 `src/app/api/score-query/by-month/route.ts`）。
- 路由頂部加註解明確指向本 spec 的 NFR-1，說明「刻意不做驗證」是確認過的產品決策，避免被誤認為忘記加 `requireAuth`（NFR-1 的驗收標準原文要求）。
- 月份為空/所選月份無資料時，`queryScoresByMonth` 已自然回傳 `[]`，不需要額外的「無資料」錯誤分支——AC-3 的提示文字由前端（T-3/T-5）負責呈現，API 只需忠實回傳空陣列。
- 測試層級：AC-2/3/5/6/7/12 這幾條在此 task 的部分都是資料/API 行為，沿用既有 route-level test 慣例（`by-month/route.test.ts` 同款寫法），不需要 component test：
  - 無 `sid` cookie 呼叫，回應 200（非 401）且資料內容正確（AC-6）。
  - 回應不含 `Set-Cookie`，呼叫前後 `prisma.session.count()` 不變（AC-7）。
  - 用同一組 fixture 資料，比對這支新路由與既有 `/api/score-query/by-month`（帶登入 session）回傳的 `employeeId`/`personName`/五項分數/`totalScore`/`records` 完全相等（AC-5、NFR-2 驗收標準明文要求的比對測試）。
  - 所選月份無資料時回傳 `[]`（AC-3 的資料面前提）。

AC 摘要：
- AC-2 Then：不需輸入任何條件，畫面直接顯示當下月份所有計分人員依總分排序的排行榜，每筆資料顯示姓名、工號、總分
- AC-3 Then：畫面顯示明確的「該月份尚無資料」提示文字，不是例外錯誤畫面、也不是無說明的空白列表
- AC-5 Then：五項分數、總分、每日明細內容完全一致，不因免登入而有不同的計算結果
- AC-6 Then：系統正常顯示當月所有人的分數與排名（此為使用者已確認的產品決策，風險說明見 NFR-1）
- AC-7 Then：系統不因此建立任何 session/cookie，不將這次瀏覽視為一次登入行為，既有 developer/foreman 的登入模型與人數不受影響
- AC-12 Then：排行榜、堆疊長條圖皆重新載入並顯示該月份的資料，不需重新整理頁面；之後開啟任一人員的個人資訊彈窗也顯示該月份的資料

---

#### T-2：`src/proxy.ts` 排除 `/board` [(infra)]
refs: AC-1
估時: 1
風險: 低 — 單純調整既有 matcher regex，不影響其餘路徑

實作重點：
- 修改 `config.matcher`，在既有 `["/((?!api|login|_next/static|_next/image|favicon.ico).*)"]` 的 negative lookahead 中加入 `board`，並加註解指向 spec FR-1，說明首頁（`/`）與其餘既有頁面 matcher 規則維持不變。
- 測試層級：這是路由設定/正則邏輯，屬於「資料/行為」而非畫面渲染，不需要 component test 或 Playwright：直接對 `config.matcher` 的 regex 字串（或匯出後以 `new RegExp` 建構）寫 plain Vitest test，斷言 `/board` 不匹配、`/`、`/forms`、`/settings/persons` 等既有路徑仍匹配。若要更貼近實際行為，也可直接呼叫匯出的 `proxy()` 函式並帶入一個不含 `sid` cookie 的假 `NextRequest`（`new NextRequest("http://localhost/board")`），斷言回傳值不是 redirect response。

AC 摘要：
- AC-1 Then：系統不將其導向 `/login`，直接呈現頁面內容

---

#### T-3：`/board` 頁面骨架、TopNav 排除、資料 fetch/state [(infra)]
refs: AC-1, AC-2, AC-3, AC-7, AC-12
估時: 4
風險: 中 — 需要同時處理「公開頁面不該顯示內部導覽」與「不能用會導回 /login 的 fetch 封裝」兩個容易被慣例帶偏的細節

實作重點：
- 新增 `src/app/board/page.tsx`：`"use client"`，比照 `src/app/query/score/page.tsx` 的 mount-time fetch 慣例（`useEffect` 內宣告 inline `async function`），呼叫 T-1 的 `/api/public/score-board/by-month?month=...`。**改用原生 `fetch`，不使用 `authFetch`**（`src/lib/auth-client.ts`）——`authFetch` 在收到 401 時會強制導向 `/login`，這個行為只對「應該登入卻未登入」的頁面有意義，`/board` 本來就不要求登入，用 `authFetch` 會引入不必要、方向錯誤的耦合（技術決策見下）。
- 月份 state 預設 `currentMonth()`（沿用 `/query/score` 同款 `new Date().toISOString().slice(0, 7)` 寫法），`<input type="month">` 變更時觸發重新 fetch（月份切換的實際串接留給 T-13，這裡只搭好 state/fetch 骨架）。
- 修改 `src/app/top-nav.tsx`：`if (pathname === "/login") return null;` 改為同時排除 `/board`，避免公開頁面對外顯示內部導覽連結、也省下對 `/api/auth/me` 的無意義呼叫（技術決策見下）。
- `queryScoresByMonth` 回傳 `[]` 時顯示「該月份尚無資料」文字區塊（AC-3），非表格空列、非錯誤畫面。
- 測試層級：AC-2/AC-3 是「給定資料，畫面渲染什麼」的 UI 邏輯，規劃 component test（Vitest + RTL，jsdom，`// @vitest-environment jsdom`，mock `fetch`，比照 `src/app/query/score/page.test.tsx`）：給定 API 回傳非空陣列，斷言依總分排序渲染；給定 `[]`，斷言渲染「該月份尚無資料」文字而非空表格。AC-1/AC-7 在此 task 屬於「頁面確實會被呈現、且過程不涉及 session」的前提，已由 T-1/T-2 的 route/proxy 層測試涵蓋，此處不重複用 component test 驗證。

AC 摘要：
- AC-1 Then：系統不將其導向 `/login`，直接呈現頁面內容
- AC-2 Then：不需輸入任何條件，畫面直接顯示當下月份所有計分人員依總分排序的排行榜，每筆資料顯示姓名、工號、總分
- AC-3 Then：畫面顯示明確的「該月份尚無資料」提示文字，不是例外錯誤畫面、也不是無說明的空白列表
- AC-7 Then：系統不因此建立任何 session/cookie，不將這次瀏覽視為一次登入行為，既有 developer/foreman 的登入模型與人數不受影響
- AC-12 Then：排行榜、堆疊長條圖皆重新載入並顯示該月份的資料，不需重新整理頁面；之後開啟任一人員的個人資訊彈窗也顯示該月份的資料

---

#### T-4：響應式斷點判斷 hook（`useIsNarrowScreen`） [(infra)]
refs: AC-13, AC-14
估時: 2
風險: 低

實作重點：
- 新增共用 hook（例如 `src/app/board/use-is-narrow-screen.ts`），內部用 `window.matchMedia("(max-width: 768px)")` 訂閱變化，回傳 boolean。斷點值 768px 為本次技術決策（見下）。
- 刻意用 JS 狀態驅動、不是純 CSS media query 切換兩套 markup——理由與測試層級直接相關，見下方技術決策第 5 項。
- 測試層級：純邏輯 hook，component test 中透過 mock `window.matchMedia`（回傳固定 `matches` 值 + 假的 `addEventListener`/`removeEventListener`）驗證 hook 回傳值隨 `matches` 正確切換，不需要 Playwright。

AC 摘要：
- AC-13 Then：排行榜清單只顯示排名／姓名／總分三欄；點選後畫面底部滑出操作表（佔滿螢幕寬度）顯示該人員完整資訊；使用者可透過下滑手勢、點擊背景空白處、或關閉鈕關閉操作表
- AC-14 Then：排行榜清單顯示完整欄位（含五項分數）；點選後以置中對話框顯示該人員完整資訊，可透過點擊背景、Esc 鍵、或關閉鈕關閉

---

#### T-5：排行榜清單基礎渲染（排序、空狀態）
refs: AC-2, AC-3
估時: 3
風險: 低

實作重點：
- 在 T-3 的頁面骨架內渲染排行榜表格，資料已由 API 依總分排序（`queryScoresByMonth` 既有排序邏輯），前端不需重新排序；總分相同時的次要排序規則見技術決策第 4 項（在 T-1 API 層或 T-5 前端層擇一實作，建議放 API 層，讓所有消費端——排行榜、堆疊長條圖——共享同一份已排序資料，堆疊長條圖不需自行決定「前 N 名」的 tie-break）。
- `rows.length === 0` 時渲染「該月份尚無資料」提示區塊（AC-3）。
- 測試層級：component test（同 T-3 環境），斷言表格列順序與 fixture 資料的總分排序一致、空陣列時渲染提示文字。

AC 摘要：
- AC-2 Then：不需輸入任何條件，畫面直接顯示當下月份所有計分人員依總分排序的排行榜，每筆資料顯示姓名、工號、總分
- AC-3 Then：畫面顯示明確的「該月份尚無資料」提示文字，不是例外錯誤畫面、也不是無說明的空白列表

---

#### T-6：排行榜清單響應式欄位
refs: AC-13, AC-14
估時: 3
風險: 低

實作重點：
- 用 T-4 的 `useIsNarrowScreen()` 決定欄位集：窄螢幕只渲染排名／姓名／總分三欄；寬螢幕渲染姓名、工號、五項分數、總分完整欄位。
- 每一列（含窄螢幕版）點擊區域與任何按鈕的觸控目標尺寸不小於 44×44px（含內距）——NFR-4 的驗收標準，兩種版面共用同一套點擊列樣式規則。
- 測試層級：component test，mock `matchMedia` 分別回傳窄/寬狀態，斷言窄螢幕下 `<th>`/`<td>` 只有三欄、寬螢幕下有完整欄位（這是「元素渲染與否」的 UI 邏輯，jsdom 可直接驗證，不需要 Playwright；真實斷點視覺效果留待人工於瀏覽器縮放視窗做一次性 spot check，不建立對應自動化測試）。

AC 摘要：
- AC-13 Then：排行榜清單只顯示排名／姓名／總分三欄；點選後畫面底部滑出操作表（佔滿螢幕寬度）顯示該人員完整資訊；使用者可透過下滑手勢、點擊背景空白處、或關閉鈕關閉操作表
- AC-14 Then：排行榜清單顯示完整欄位（含五項分數）；點選後以置中對話框顯示該人員完整資訊，可透過點擊背景、Esc 鍵、或關閉鈕關閉

---

#### T-7：個人資訊彈窗容器（dialog / bottom sheet 共用邏輯） [(infra)]
refs: AC-4, AC-13, AC-14, AC-15
估時: 6
風險: 中 — 本案最容易出錯的部分：焦點管理、tab 循環、bottom sheet 手勢，三者都是狀態機邏輯，邊界情況多

實作重點：
- 寬螢幕（置中對話框，AC-14）以原生 `<dialog>` element 為基礎（原生具備部分 focus-trap 與 `Esc` 關閉行為），疊加自訂焦點管理補齊 AC-15 完整需求；窄螢幕（bottom sheet，AC-13）改用 `<div role="dialog">` 自建（需要自訂滑出動畫與下滑手勢，原生 `<dialog>` 的行為在這裡反而要被覆蓋掉，見技術決策第 7 項）。兩種容器共用同一套焦點管理 hook/邏輯，只有 markup 與開關動畫不同。
- `role="dialog"`、`aria-modal="true"`、`aria-labelledby` 指向人員姓名節點（NFR-4）。
- 開啟時：焦點自動移入彈窗內第一個可互動元素或關閉鈕；`Tab`/`Shift+Tab` 只在彈窗內部可互動元素間循環（focus trap），不得跳到背景排行榜；`Esc` 或啟用關閉鈕可關閉；關閉後焦點回到觸發開啟的那一列（記錄觸發時的 `document.activeElement`，關閉時 `.focus()` 回去）。
- Bottom sheet 額外支援：下滑手勢（`touchstart`/`touchmove`/`touchend` 計算垂直位移，超過閾值視為關閉意圖）、點擊背景空白處關閉、右上角關閉鈕。
- 觸控目標尺寸（關閉鈕）不小於 44×44px（含內距，NFR-4）。
- 測試層級：這幾條 AC 描述的是可透過鍵盤/事件模擬驗證的互動邏輯（焦點落點、tab 循環、關閉事件觸發），jsdom + RTL 的 `userEvent`（`tab()`、`keyboard('{Escape}')`、`fireEvent.touchStart/Move/End`）足以驗證，不需要 Playwright：
  - 開啟後 `document.activeElement` 落在彈窗內（AC-15）。
  - 連續 `Tab` 循環只在彈窗內部元素間移動，不跳出彈窗（AC-15）。
  - `Esc`、背景點擊、關閉鈕點擊三種方式皆觸發關閉且關閉後焦點回到觸發列（AC-4、AC-15）。
  - bottom sheet：模擬 `touchstart`→`touchmove`（向下位移超過閾值）→`touchend`，斷言觸發關閉（AC-13）。手勢模擬如證實在 CI 中不穩定，可退而只驗證點擊背景/關閉鈕兩條路徑為主，手勢改為人工於實機驗證一次，並在 verify 階段的 evidence 註明。

AC 摘要：
- AC-4 Then：畫面開啟彈窗顯示該人員的分數組成與每日明細（詳見 AC-9、AC-10）；使用者可透過彈窗右上角關閉鈕、點擊背景遮罩、或按 Esc 鍵關閉彈窗，關閉後回到排行榜、排行榜本身不受影響
- AC-13 Then：排行榜清單只顯示排名／姓名／總分三欄；點選後畫面底部滑出操作表（佔滿螢幕寬度）顯示該人員完整資訊；使用者可透過下滑手勢、點擊背景空白處、或關閉鈕關閉操作表
- AC-14 Then：排行榜清單顯示完整欄位（含五項分數）；點選後以置中對話框顯示該人員完整資訊，可透過點擊背景、Esc 鍵、或關閉鈕關閉
- AC-15 Then：焦點自動移入彈窗內；Tab/Shift+Tab 只在彈窗內部的可互動元素間循環，不會跳到背景排行榜；按 Esc 或聚焦到關閉鈕並確認可關閉彈窗；關閉後焦點回到原本觸發開啟的那一列

---

#### T-8：五分類顏色對應表 [(infra)]
refs: AC-9, AC-11
估時: 1
風險: 低

實作重點：
- 新增純函式/常數模組（例如 `src/app/board/score-colors.ts`），匯出出勤類別分／加班分／配合度分／3S分／SOP分五項固定顏色對應（key 用與 `PersonScoreSummary` 一致的欄位名：`categoryScore`/`overtimeScore`/`complianceScore`/`threeSScore`/`sopScore`），供 T-9 甜甜圈圖與 T-11 堆疊長條圖共用，確保 AC-9/AC-11 要求的「同一項分數在兩張圖表上永遠是同一個顏色」不會各自維護一份而漂移。
- 測試層級：plain Vitest（無需 jsdom），斷言五個 key 都有對應顏色、顏色值不重複。

AC 摘要：
- AC-9 Then：（圖例／環狀圖顏色對應部分）圖表旁或下方有對應圖例，列出全部五項的名稱與實際數值
- AC-11 Then：頁面上有一張堆疊長條圖…五項分數以不同顏色分段堆疊，顏色對應與 AC-9 甜甜圈圖一致

---

#### T-9：甜甜圈圖與圖例（負值處理）
refs: AC-9
估時: 5
風險: 中 — 環狀圖只用「數值為正」的項目計算佔比，圖例卻要列出全部五項（含 0 與負值），兩份資料來源不同，邏輯要分開寫清楚避免混用

實作重點：
- 手刻 SVG 環狀圖（不引入圖表套件，理由見技術決策第 6 項）：只取五項分數中「數值 > 0」者計算佔比、決定弧長，用 T-8 的顏色對應上色；正中央顯示 `totalScore`（含負值項目影響後的真實總和，不是環狀圖各正值加總）。
- 圖例：無條件列出全部五項（含 0 或負數），負值項目額外加上視覺可辨識標示（例如負號＋不同顏色文字 class），不因無法畫進環狀圖就從圖例省略。
- 測試層級：component test。環狀圖是用資料算出來的 SVG（`stroke-dasharray`／`path d` 等數值型屬性），不依賴真實瀏覽器 CSS 版面，jsdom 可直接斷言算出的弧長比例是否符合資料；圖例部分斷言五個項目文字與數值都存在、負值項目有對應 class/標示、總分數字為 `totalScore` 而非正值加總。不需要 Playwright。

AC 摘要：
- AC-9 Then：畫面顯示一個甜甜圈圖，環狀部分依五項分數中「數值為正」的項目分色呈現各自佔比，圖表正中央顯示該人員的總分數字（total，含負值項目影響後的真實總和）；圖表旁或下方有對應圖例，列出全部五項（含數值為 0 或負數者）的名稱與實際數值，負值以視覺上可辨識的方式標示，不因為無法畫進環狀圖就從圖例省略

---

#### T-10：每日明細表格（sticky 表頭＋捲動陰影）
refs: AC-10
估時: 4
風險: 高 — 需要先建立 Playwright 環境（專案目前無 `playwright.config.ts`）；`position: sticky` 與捲動陰影顯示/消失的判斷（比對 `scrollTop`/`scrollHeight`/`clientHeight`）在 jsdom 下沒有真實版面尺寸，component test 驗證不到

實作重點：
- 彈窗內每日明細表格區域固定高度、內部 `overflow-y: auto`；`<thead>` 用 `position: sticky; top: 0` 固定在捲動區域頂部。
- 捲動陰影：監聽該捲動容器的 `scroll` 事件，比對 `scrollTop + clientHeight < scrollHeight`，未到底時顯示底部淡出漸層陰影，捲到底時移除。
- 彈窗整體高度維持固定上限，不隨資料筆數（例如接近整月的明細）撐高——這一點本身是 CSS 版面約束（固定 `max-height` + 內部捲動），不是 JS 邏輯，同樣需要真實瀏覽器驗證版面是否真的沒被撐開。
- 測試層級：這條 AC 描述的是「真實排版 + 是否可捲動」的行為（sticky 定位效果、依實際捲動位置顯示/隱藏陰影、彈窗高度是否真的沒被撐高），component test 的 jsdom 不做真實 CSS layout，此類斷言只有在真實瀏覽器引擎裡才驗得到 → 規劃 Playwright 測試。
  - 前置：本專案尚無 Playwright，需先 `npm install -D @playwright/test`、新增 `playwright.config.ts`、`npx playwright install`。
  - 測試案例（`src/app/board/*.spec.ts` 或專案慣用的 e2e 目錄，實作時定案）：開啟一個明細筆數接近整月的人員彈窗，斷言彈窗容器高度不超過設定上限；捲動明細表格區域到底部前，陰影元素可見；捲到底後陰影元素消失或 opacity 為 0；捲動中表頭仍在可視區域內（`getBoundingClientRect().top` 落在容器頂部附近）。用官方 tag 語法標記：`test('...', { tag: '@AC-10' }, async ({ page }) => { ... })`，讓 `/verify` 能用 `npx playwright test --grep "@AC-10"` 精準執行。

AC 摘要：
- AC-10 Then：彈窗整體高度維持固定上限，超出可視範圍的每日明細列透過表格區域自身的捲動呈現，不會把整個彈窗或頁面撐開；捲動時表格表頭固定在該區域頂部持續可見；區域底部尚有未捲動到的內容時顯示淡出漸層陰影提示，捲到底部時陰影消失

---

#### T-11：堆疊長條圖
refs: AC-11
估時: 4
風險: 低

實作重點：
- 手刻 SVG 堆疊長條圖，取排行榜前 `TOP_N_FOR_CHART = 8`（技術決策第 8 項）名人員；若當月符合資格人員少於 8 人，取全部人員，不視為錯誤（沿用 T-5 已排序好的資料，不重新呼叫 API、不重新計算）。
- 每人一條長條，五項分數依 T-8 顏色對應分段堆疊；圖表數值必須直接來自與排行榜/彈窗相同的資料物件（同一份 fetch 結果），避免另外一份計算邏輯造成數字不一致。
- 測試層級：component test，斷言渲染的長條數等於 `min(8, 資料筆數)`、每條長條的分段數值與來源資料一致、顏色與 T-8 對應表一致；不需要 Playwright（純資料驅動的 SVG 數值，非真實版面度量）。

AC 摘要：
- AC-11 Then：頁面上有一張堆疊長條圖，顯示目前總分前 N 名人員的五項分數組成（每人一條長條，五項分數以不同顏色分段堆疊，顏色對應與 AC-9 甜甜圈圖一致），且圖表數值與排行榜/彈窗顯示的對應人員分數一致；若當月符合資格人員少於 N 人，顯示全部人員

---

#### T-12：彈窗內容組裝
refs: AC-4, AC-9, AC-10
估時: 3
風險: 低

實作重點：
- 將 T-7（容器）、T-9（甜甜圈圖＋圖例）、T-10（明細表格）組裝進彈窗內容，由上到下依序：人員姓名／工號／當月名次、甜甜圈圖＋圖例、每日明細表格（FR-8 順序）。
- 當月名次由該人員在目前排行榜資料中的索引位置＋1 計算，不需要 API 額外回傳名次欄位。
- 點擊排行榜任一列時開啟彈窗並帶入該人員資料；關閉後排行榜本身資料/state 不受影響（AC-4 的「排行榜本身不受影響」）。
- 測試層級：component test，斷言點擊列後彈窗內容依序出現姓名/工號/名次、甜甜圈圖、明細表格；關閉後排行榜資料 state 不變（沿用同一份物件參照或重新渲染後內容一致）。

AC 摘要：
- AC-4 Then：畫面開啟彈窗顯示該人員的分數組成與每日明細；使用者可透過彈窗右上角關閉鈕、點擊背景遮罩、或按 Esc 鍵關閉彈窗，關閉後回到排行榜、排行榜本身不受影響
- AC-9 Then：畫面顯示一個甜甜圈圖…圖表正中央顯示該人員的總分數字…圖例列出全部五項的名稱與實際數值
- AC-10 Then：彈窗整體高度維持固定上限…捲動時表格表頭固定在該區域頂部持續可見；區域底部尚有未捲動到的內容時顯示淡出漸層陰影提示，捲到底部時陰影消失

---

#### T-13：月份切換串接
refs: AC-12
估時: 2
風險: 低

實作重點：
- `<input type="month">` 變更時，重新呼叫 T-1 的 API，更新排行榜（T-5/T-6）與堆疊長條圖（T-11）資料，不重新整理頁面。
- 已開啟的彈窗（若切換月份時彈窗仍開著）需重新抓對應月份的資料；若使用者是先切換月份、再開啟彈窗，彈窗開啟時使用的就已經是新月份的資料（因為排行榜資料本身已更新，彈窗資料來自同一份 state，天然滿足）。
- 測試層級：component test，mock 兩次不同月份的 fetch 回應，斷言切換 `<input type="month">` 後排行榜與堆疊長條圖畫面更新為第二次回應的資料、且未觸發整頁重新整理（沒有呼叫 `window.location.reload`/`router.refresh` 之類）。

AC 摘要：
- AC-12 Then：排行榜、堆疊長條圖皆重新載入並顯示該月份的資料，不需重新整理頁面；之後開啟任一人員的個人資訊彈窗也顯示該月份的資料

---

#### T-14：首頁新增公開頁面連結
refs: AC-8
估時: 1
風險: 低

實作重點：
- 在 `src/app/page.tsx` 現有「快速連結」清單中新增一條 `<Link href="/board">員工分數查詢（免登入，可分享給現場平板）</Link>`，措辭比照既有清單風格。
- 首頁本身的登入門檻不變（`proxy.ts` matcher 未排除 `/`，T-2 已限定只排除 `/board`），不需要額外程式碼變更即可維持。
- 測試層級：component test（或既有慣例允許的最簡單 render 斷言即可），斷言首頁渲染出指向 `/board` 的連結；首頁仍在登入牆後面這件事由 T-2 的 proxy matcher regex 測試涵蓋（斷言 `/` 仍匹配 matcher），此處不重複驗證。

AC 摘要：
- AC-8 Then：畫面上看得到一個連結指向 FR-1 的公開排行榜頁面；同時，未登入使用者造訪首頁本身仍會被導向 `/login`（首頁的登入門檻不因本功能改變）

---

## 執行順序

1. T-2（proxy 排除）、T-1（公開 API）——彼此獨立，可平行進行，是後續所有畫面工作的地基。
2. T-4（響應式斷點 hook）、T-8（顏色對應表）——與 T-1/T-2 無關的獨立小工具，建議提早做掉，供後面多個 task 共用。
3. T-3（頁面骨架、TopNav 排除、fetch/state）——依賴 T-1（呼叫的 API）、T-2（頁面才不會被導去 `/login`）。
4. T-5（排行榜基礎渲染）——依賴 T-3 的資料 state。
5. T-6（排行榜響應式欄位）——依賴 T-5 + T-4。
6. T-7（彈窗容器）——依賴 T-4（決定用 bottom sheet 還是置中對話框）；可與步驟 4-5 平行進行。
7. T-9（甜甜圈圖）、T-10（明細表格，含 Playwright 環境建置）、T-11（堆疊長條圖）——依賴 T-8（顏色）與 T-5（排行榜資料，T-11 需要）；三者可平行進行。T-10 因為要另外建 Playwright 環境，建議提早啟動以免卡在執行順序尾端才發現環境問題。
8. T-12（彈窗內容組裝）——依賴 T-7、T-9、T-10 都完成。
9. T-13（月份切換串接）——依賴 T-3/T-5/T-6/T-11/T-12 都已存在，是把前面所有片段串成完整互動的最後一步。
10. T-14（首頁連結）——只依賴 T-2 確認 `/board` 路徑定案，可在任何時間點插入，不擋在關鍵路徑上。

## 技術決策記錄

1. **路由/API 命名**：頁面 `/board`；API `/api/public/score-board/by-month?month=YYYY-MM`（`src/app/api/public/score-board/by-month/route.ts`）。加上 `/api/public/` 前綴，讓「這個路徑刻意不經過 `requireAuth`」在檔案結構上一望即知，方便未來稽核，也避免跟既有 `/api/score-query/by-month` 混淆。
2. **TopNav 排除 `/board`**：`src/app/top-nav.tsx` 目前 `if (pathname === "/login") return null;` 改為同時排除 `/board`。理由：公開頁面對外顯示內部導覽連結（`/forms`、`/settings` 等）沒有意義（訪客點了也只會被導去 `/login`），且省下對 `/api/auth/me` 的無意義呼叫。
3. **前端 fetch 方式**：`/board` 頁面用原生 `fetch`，不用 `authFetch`（`src/lib/auth-client.ts`）。`authFetch` 在收到 401 時強制導向 `/login`，這個假設只對「應該登入卻未登入」的頁面成立；`/board` 本來就不要求登入，公開 API 也設計成不會回 401，套用 `authFetch` 反而引入方向錯誤的耦合。
4. **FR-4 次要排序（總分相同時）**：`personName.localeCompare(other, "zh-Hant")` 為第一層 tiebreak，仍相同則以 `employeeId` 字串排序做最終 tiebreak，確保排序在任何情況下都是確定性的。真正的「筆畫排序」需要額外的筆畫資料表，目前系統沒有對應資料來源，超出本次範圍——`localeCompare("zh-Hant")` 是目前技術條件下最接近的近似值。
5. **響應式斷點與實作方式**：`max-width: 768px` 作為窄/寬螢幕分界，透過 `useIsNarrowScreen()`（`window.matchMedia` 為底層，T-4）而非純 CSS media query 驅動兩套 markup 的切換。理由：JS 狀態驅動可以在 jsdom 用 mock `matchMedia` 直接做 component test（見 T-4/T-6 測試層級），不需要為 AC-13/AC-14 這幾條另外建立 Playwright 環境；純 CSS-only 寫法在 jsdom 下無法驗證「哪個版面實際生效」，會被迫全部改用 Playwright，增加測試成本。
6. **圖表實作：手刻 SVG，不引入圖表套件**：專案目前無任何圖表依賴（`package.json` 未見 recharts/chart.js 等），資料規模小（≤20 人 × 5 分類），手刻換算成本低；AC-9 要求圖例要能顯示「數值為 0 或負數」的項目、且環狀圖只用正值計算佔比，這種「負值排除但圖例仍要列出」的規則多數現成圖表套件不直接支援，手刻能完全掌控計算邏輯；五分類顏色也需要在兩張圖表間共用同一份對應表（T-8），手刻可以直接共用同一份純函式，不受套件自身 palette/legend API 的限制。
7. **彈窗容器：`<dialog>`（寬螢幕）＋自訂 `role="dialog"`（bottom sheet）**：寬螢幕置中對話框（AC-14）用原生 `<dialog>` element 打底，取得部分免費的 focus-trap/`Esc` 行為，再疊加自訂焦點管理補齊 AC-15 完整需求；窄螢幕 bottom sheet（AC-13）需要自訂滑出動畫與下滑手勢，原生 `<dialog>` 的預設行為在這個情境反而要被覆蓋掉，故改用一般 `<div role="dialog">` 自建。兩者共用同一套焦點管理邏輯（T-7），只有容器 markup 與開關動畫不同。
8. **堆疊長條圖 N 值**：沿用 spec 草案，定為前端常數 `TOP_N_FOR_CHART = 8`，與排行榜清單「列出全部人員、不裁切」的邏輯分開判斷，避免兩處誤用同一個裁切邏輯。

## 衝突事項

無。規劃過程中檢視了 `src/proxy.ts`（UX shortcut，非安全邊界）、`src/lib/auth.ts`（既有 `requireAuth`/`requireRole` 慣例）、`docs/auth.md` 對「不是每個 GET 都要 `requireAuth`——看 spec，不要預設」的既有共識，以及 `src/lib/score-query.ts`/`docs/architecture.md` 的既有計分邏輯，皆未發現 spec 的 AC 隱含要打破既有系統的既定限制或設計——spec NFR-1/NFR-3 明確記載「刻意不做驗證」是使用者已在需求討論階段確認過的產品決策，且 spec 本身已經按 `docs/auth.md`「不是每個 GET 都要 requireAuth，要看 spec」的既有共識來設計（新增免驗證路由不代表打破慣例，而是慣例本來就允許 spec 明確做這個選擇）。
