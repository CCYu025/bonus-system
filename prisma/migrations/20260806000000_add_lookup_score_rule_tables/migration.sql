-- CreateTable: 配合度積分設定（docs/2026-08-06-score-rules-lookup-scoring）。
-- 每個配合度項目最多一筆（complianceRatingId 唯一），未有對應列即代表「未設定」。
CREATE TABLE "compliance_rating_score_rule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "complianceRatingId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "compliance_rating_score_rule_complianceRatingId_fkey" FOREIGN KEY ("complianceRatingId") REFERENCES "compliance_rating" ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "compliance_rating_score_rule_complianceRatingId_key" ON "compliance_rating_score_rule"("complianceRatingId");

-- CreateTable: 3S表現積分設定，結構同上。
CREATE TABLE "three_s_performance_score_rule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threeSPerformanceId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "three_s_performance_score_rule_threeSPerformanceId_fkey" FOREIGN KEY ("threeSPerformanceId") REFERENCES "three_s_performance" ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "three_s_performance_score_rule_threeSPerformanceId_key" ON "three_s_performance_score_rule"("threeSPerformanceId");

-- CreateTable: SOP表現積分設定，結構同上。
CREATE TABLE "sop_performance_score_rule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sopPerformanceId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "sop_performance_score_rule_sopPerformanceId_fkey" FOREIGN KEY ("sopPerformanceId") REFERENCES "sop_performance" ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sop_performance_score_rule_sopPerformanceId_key" ON "sop_performance_score_rule"("sopPerformanceId");
