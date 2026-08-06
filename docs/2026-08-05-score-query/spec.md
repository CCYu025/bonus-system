<!-- AC-CONFIRMED: 2026-08-05 -->
# 查詢分數 — Spec

## 1. Problem Statement

目前系統已有「出勤積分規則設定」(`/score-rules`)，可為每個出勤類別與加班時數級距設定分數，但這些規則目前沒有任何計算路徑會讀取、套用。人資/主管需要一個查詢畫面，依月份查看每位人員當月依出勤紀錄與現行積分規則算出的分數，作為獎金/考核的參考依據，而不必手動比對出勤表與規則表。

## 2. Scope（本次範圍）

- **In scope**
  - 新增「查詢分數」頁面，篩選條件僅「月份」。
  - 依人員彙總顯示「出勤類別分」「加班分」「總分」，依總分由高到低排序。
  - 點擊人員列可展開該月逐筆出勤紀錄的計分明細。
  - 分數即時依當下的出勤紀錄與積分規則現算，不落地儲存、不建快取表。
  - 權限比照既有 `attendance-query`：`foreman`、`developer` 皆可查詢。

- **Out of scope**
  - 配合度、3S 表現、SOP 表現、實際產量的計分（目前無對應積分規則表）。
  - 匯出（CSV/列印）。
  - 分數結果落地存表或快取。
  - 積分規則版本化 / 生效日期區間（規則異動立即套用到所有月份查詢，見 NFR-2）。
  - 依人員/工號等其他篩選條件（僅支援月份篩選）。
  - `foreman` 依所屬人員範圍縮小查詢結果（維持與 `attendance-query` 一致，不分是誰送審，全部人員皆可見）。
  - 對 `Person` schema 的任何異動（人員清單規則完全用既有 `status` 欄位與 `AttendanceRecord` 資料推導）。

## 3. Functional Requirements

- **FR-1**：使用者可在查詢分數頁面選擇一個月份並查詢，取得該月的人員分數彙總列表。
- **FR-2**：彙總列表顯示每位人員的「出勤類別分」「加班分」「總分」，依總分由高到低排序。
- **FR-3**：點擊彙總列表中的人員列，可展開該月逐筆出勤紀錄的計分明細（日期、出勤類別、類別分、加班時數、加班分、小計）。
- **FR-4**：分數計算即時依現行 `CategoryScoreRule`／`OvertimeScoreRule` 與 `AttendanceRecord` 現算，不寫入任何新的資料表或快取。
- **FR-5**：查詢結果的人員清單 = 「目前 `status = active` 的所有人員」∪「該月有核准且未作廢紀錄的所有人員」。
- **FR-6**：查詢分數 API 的權限與 `attendance-query` 一致，僅需登入（`requireAuth`），不限定角色。

## 4. Acceptance Criteria

**AC-1：月份篩選查詢**
- Given：已登入的使用者（`foreman` 或 `developer`）進入查詢分數頁面
- When：選擇一個月份並送出查詢
- Then：畫面顯示該月每位人員的分數彙總列（工號、姓名、出勤類別分、加班分、總分），不需其他篩選條件即可查得結果

**AC-2：出勤類別分計算**
- Given：一筆核准且未作廢的 `AttendanceRecord`，其 `categoryId` 對應到某出勤類別
- When：系統計算該筆紀錄的出勤類別分
- Then：若該類別存在對應的 `CategoryScoreRule`，取其 `points`；若不存在，計為 0

**AC-3：加班分計算 — 正常出勤（平日）**
- Given：一筆核准且未作廢的紀錄，`categoryId` 為「正常出勤」，`overtimeHours` 有值
- When：系統計算該筆紀錄的加班分
- Then：依 `overtimeHours` 落點套用 `OvertimeScoreRule` 中 `overtimeType = weekday` 對應級距的 `points`

**AC-4：加班分計算 — 假日加班**
- Given：一筆核准且未作廢的紀錄，`categoryId` 為「假日加班」，`overtimeHours` 有值
- When：系統計算該筆紀錄的加班分
- Then：依 `overtimeHours` 落點套用 `overtimeType = holiday` 對應級距的 `points`；若落在「超過 8 小時」的最高一階，另加 `pointsPerExtraHour × 超出的時數`

**AC-5：其他類別無加班分**
- Given：一筆紀錄的 `categoryId` 為「正常出勤」「假日加班」以外的類別（如事假、病假、特休）
- When：系統計算該筆紀錄的加班分
- Then：加班分為 0（因該類別的 `overtimeHours` 恆為 `null`，不套用任何加班級距）

**AC-6：只計入核准且未作廢的紀錄**
- Given：某人員該月同時存在 `draft`／`pending_review`／`rejected` 或已作廢狀態的紀錄，以及一筆 `approved` 且生效中（`activeDateKey`/`activeKey` 非 null）的紀錄
- When：查詢該月分數
- Then：只有 `approved` 且生效中的紀錄被計入分數；其餘狀態的紀錄不影響該人員的總分

**AC-7：個人總分加總**
- Given：某人員該月有多筆核准且生效中的紀錄，各自已算出類別分與加班分
- When：系統彙總該人員該月分數
- Then：彙總列的「總分」= 該月所有計入紀錄的（類別分 + 加班分）加總

**AC-8：依總分排序**
- Given：查詢結果包含多位人員
- When：顯示彙總列表
- Then：列表依總分由高到低排序

**AC-9：展開逐筆明細**
- Given：彙總列表已顯示
- When：使用者點擊某位人員的列
- Then：該列下方展開逐筆出勤紀錄明細（日期、出勤類別、類別分、加班時數、加班分、小計），依日期由舊到新排序

**AC-10：在職但當月無紀錄的人員仍列出**
- Given：某人員 `status = active`，但該月沒有任何核准且生效中的紀錄
- When：查詢該月分數
- Then：該人員仍出現在列表中，出勤類別分、加班分、總分皆顯示 0

**AC-11：當月才離職的人員列出**
- Given：某人員於查詢月份中途被標記為 `terminated`，但該月月初至離職日之間有核准且生效中的紀錄
- When：查詢該月分數
- Then：該人員出現在列表中，分數依其該月實際核准紀錄計算

**AC-12：更早月份離職的人員不列出**
- Given：某人員已於更早的月份被標記為 `terminated`，查詢月份中沒有任何屬於該人員的核准且生效中紀錄
- When：查詢該月分數
- Then：該人員不出現在查詢結果列表中

**AC-13：foreman 與 developer 皆可查詢**
- Given：使用者已登入，角色為 `foreman` 或 `developer`
- When：呼叫查詢分數 API
- Then：兩種角色皆可成功取得查詢結果，不因角色被拒絕（403）

**AC-14：未登入無法查詢**
- Given：使用者未登入（無有效 session）
- When：呼叫查詢分數 API
- Then：回傳 401，不回傳任何分數資料

## 5. Non-Functional Requirements（NFR）

- **NFR-1**：即時運算，不新增分數儲存或快取用途的資料表 — 標準：本功能完成後不新增/修改任何 Prisma schema、不產生新的 migration。
- **NFR-2**：積分規則不做版本化，規則異動立即套用到所有月份的查詢結果（含已查詢過的過去月份），且無法還原規則變動前的歷史數字 — 標準：此為已與使用者確認接受的已知限制（方案 A），非缺陷；驗收時不要求歷史規則回溯能力。
- **NFR-3**：錯誤處理遵循既有慣例 — 標準：新增的 API route 使用 `withErrorHandling` 包裝、以 `AppError` 表達客戶端可見的錯誤，不在 route 內另行手刻錯誤分支。

## 6. Open Questions

以下兩項已於 AC 確認時一併定案，記錄決策供實作端參考：

- **OQ-1（已定案）**：查詢月份若無任何符合資格的人員，畫面顯示為**空表格**即可，不額外加提示文字。
- **OQ-2（已定案）**：NFR-2 所述「規則異動會影響所有月份查詢結果」的限制，**不在查詢分數頁面上加任何提示文字**揭露此行為。
