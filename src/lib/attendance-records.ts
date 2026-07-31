// T-1: 「未填」判斷共用邏輯——待審核畫面（forms.ts）與出勤查詢（attendance-query.ts）
// 皆以此為唯一依據，避免兩處對「未填」的定義各自實作而產生不一致。
// 只用於讀取／組裝結果時過濾顯示內容，絕不用於刪除或修改 AttendanceRecord。
export function isFilledRecord(record: { categoryId: string | null }): boolean {
  return record.categoryId !== null;
}
