-- CreateTable: 出勤類別積分設定（docs/2026-08-04-attendance-scoring-rules）。
-- 每個類別最多一筆（categoryId 唯一），未有對應列即代表「未設定」。
CREATE TABLE "category_score_rule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "category_score_rule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "attendance_category" ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_score_rule_categoryId_key" ON "category_score_rule"("categoryId");

-- CreateTable: 加班積分設定（平日/假日兩組互斥時數級距，不含外鍵）。
CREATE TABLE "overtime_score_rule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "overtimeType" TEXT NOT NULL,
    "minHours" INTEGER NOT NULL,
    "maxHours" INTEGER,
    "points" INTEGER NOT NULL,
    "pointsPerExtraHour" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
