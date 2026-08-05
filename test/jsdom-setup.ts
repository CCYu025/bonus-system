// 供本次新增的 jsdom + React Testing Library 元件測試使用（docs/2026-08-04-attendance-scoring-rules
// plan.md T-6）。只在個別測試檔案的 `// @vitest-environment jsdom` 指示下手動 import，
// 不掛進全域 setupFiles——既有 node 環境的 DB-backed 測試不受影響。
import "@testing-library/jest-dom/vitest";
