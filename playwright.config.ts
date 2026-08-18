import { defineConfig, devices } from "@playwright/test";

// docs/2026-08-14-employee-score-dashboard/plan.md T-10：唯一需要真實瀏覽器排版
// 才驗得到的 AC（sticky 表頭／捲動陰影／彈窗高度固定）。webServer 跑在獨立的
// port + DATABASE_URL（prisma/e2e.db），不動到本機開發用的 dev.db，也不會跟
// 手動開著的 `npm run dev`（預設 3000）搶 port。
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}/board`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: "file:./prisma/e2e.db",
    },
  },
});
