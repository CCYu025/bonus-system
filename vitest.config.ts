import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: "./test/global-setup.ts",
    setupFiles: ["./test/setup-env.ts"],
    // e2e/*.spec.ts 是 Playwright 專用（見 playwright.config.ts），用的是
    // @playwright/test 的 test()，不是 vitest 的——排除在外，否則 vitest 預設的
    // *.spec.ts glob 會誤把它當成自己的測試檔案來執行。保留 vitest 原本的
    // 預設排除清單（configDefaults.exclude），只是額外加一條，不是整個換掉。
    exclude: [...configDefaults.exclude, "**/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
