-- CreateTable
CREATE TABLE "compliance_rating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "three_s_performance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "compliance_rating_code_key" ON "compliance_rating"("code");

-- CreateIndex
CREATE UNIQUE INDEX "three_s_performance_code_key" ON "three_s_performance"("code");

-- AlterTable: extend attendance_record with the four new nullable fields
-- (docs/2026-08-01-attendance-extended-fields) — all nullable, no backfill needed.
ALTER TABLE "attendance_record" ADD COLUMN "overtimeHours" INTEGER;
ALTER TABLE "attendance_record" ADD COLUMN "complianceRatingId" TEXT REFERENCES "compliance_rating" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_record" ADD COLUMN "threeSPerformanceId" TEXT REFERENCES "three_s_performance" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_record" ADD COLUMN "actualQuantity" INTEGER;
