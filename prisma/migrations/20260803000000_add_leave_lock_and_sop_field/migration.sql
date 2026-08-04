-- AlterTable: mark leave-type categories that lock the extended fields
-- (docs/2026-08-03-attendance-leave-lock-sop-field) — nullable-default, no backfill needed.
ALTER TABLE "attendance_category" ADD COLUMN "locksExtendedFields" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: mark the "正常" option as the locked default-value source
ALTER TABLE "three_s_performance" ADD COLUMN "isLocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "sop_performance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "sop_performance_code_key" ON "sop_performance"("code");

-- AlterTable: extend attendance_record with sopPerformanceId, nullable, no backfill needed.
ALTER TABLE "attendance_record" ADD COLUMN "sopPerformanceId" TEXT REFERENCES "sop_performance" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
