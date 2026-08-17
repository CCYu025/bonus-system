import { test, expect } from "@playwright/test";
import { E2E_PERSON_NAME } from "./global-setup";

// docs/2026-08-14-employee-score-dashboard/spec.md AC-10：彈窗整體高度固定、
// 明細表格區域自身可獨立捲動、表頭 sticky、捲動陰影隨位置顯示/消失——這幾件事
// 在 jsdom 沒有真實版面尺寸驗不到，只有這裡用真實瀏覽器排版驗證。global-setup
// 已經灌好一位當月有 25 筆核准紀錄的測試人員（E2E_PERSON_NAME）。
test("person modal detail table stays fixed-height, scrolls internally, keeps a sticky header, and shows/hides the scroll fade", { tag: "@AC-10" }, async ({ page }) => {
  await page.goto("/board");

  const row = page.getByRole("row", { name: new RegExp(E2E_PERSON_NAME) });
  await expect(row).toBeVisible();
  await row.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // 彈窗整體高度維持固定上限，不隨資料筆數（25 天）無限撐高。
  const dialogBox = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(dialogBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(dialogBox!.height).toBeLessThanOrEqual(viewport!.height * 0.85);

  const scrollArea = page.getByTestId("detail-scroll-area");
  await expect(scrollArea).toBeVisible();

  // 明細表格區域本身可捲動（內容高度超過容器可視高度）。
  const isScrollable = await scrollArea.evaluate(
    (el) => el.scrollHeight > el.clientHeight
  );
  expect(isScrollable).toBe(true);

  // 表頭 sticky：捲動前後，表頭第一個儲存格的畫面座標應該幾乎不變（仍固定在
  // 捲動區域頂部），即使表格本體已經捲走一大段。
  const headerCell = scrollArea.locator("thead th").first();
  const beforeScrollY = (await headerCell.boundingBox())!.y;

  await scrollArea.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(100);

  const afterScrollY = (await headerCell.boundingBox())!.y;
  expect(Math.abs(afterScrollY - beforeScrollY)).toBeLessThan(2);

  // 捲到底後，捲動陰影應該消失（opacity 0）。
  const fade = page.getByTestId("detail-scroll-fade");
  await expect(fade).toHaveCSS("opacity", "0");

  // 捲回頂部，陰影應該重新出現（opacity 1），代表陰影是隨當下捲動位置動態決定，
  // 不是只在初次載入時判斷一次。
  await scrollArea.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.waitForTimeout(100);
  await expect(fade).toHaveCSS("opacity", "1");
});
