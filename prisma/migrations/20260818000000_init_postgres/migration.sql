-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PersonStatus" AS ENUM ('active', 'terminated');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('developer', 'foreman');

-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('draft', 'pending_review', 'approved', 'rejected', 'voided');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PersonStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_category" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "locksExtendedFields" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_rating" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "three_s_performance" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "three_s_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sop_performance" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sop_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_score_rule" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_score_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_rating_score_rule" (
    "id" TEXT NOT NULL,
    "complianceRatingId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_rating_score_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "three_s_performance_score_rule" (
    "id" TEXT NOT NULL,
    "threeSPerformanceId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "three_s_performance_score_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sop_performance_score_rule" (
    "id" TEXT NOT NULL,
    "sopPerformanceId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sop_performance_score_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_score_rule" (
    "id" TEXT NOT NULL,
    "overtimeType" TEXT NOT NULL,
    "minHours" INTEGER NOT NULL,
    "maxHours" INTEGER,
    "points" INTEGER NOT NULL,
    "pointsPerExtraHour" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_score_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_form" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" "FormStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousFormId" TEXT,
    "activeDateKey" TEXT,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_record" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "categoryId" TEXT,
    "note" TEXT,
    "overtimeHours" INTEGER,
    "complianceRatingId" TEXT,
    "threeSPerformanceId" TEXT,
    "actualQuantity" INTEGER,
    "sopPerformanceId" TEXT,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "activeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "operatorName" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "person_employeeId_key" ON "person"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_category_code_key" ON "attendance_category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_rating_code_key" ON "compliance_rating"("code");

-- CreateIndex
CREATE UNIQUE INDEX "three_s_performance_code_key" ON "three_s_performance"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sop_performance_code_key" ON "sop_performance"("code");

-- CreateIndex
CREATE UNIQUE INDEX "category_score_rule_categoryId_key" ON "category_score_rule"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_rating_score_rule_complianceRatingId_key" ON "compliance_rating_score_rule"("complianceRatingId");

-- CreateIndex
CREATE UNIQUE INDEX "three_s_performance_score_rule_threeSPerformanceId_key" ON "three_s_performance_score_rule"("threeSPerformanceId");

-- CreateIndex
CREATE UNIQUE INDEX "sop_performance_score_rule_sopPerformanceId_key" ON "sop_performance_score_rule"("sopPerformanceId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_form_previousFormId_key" ON "attendance_form"("previousFormId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_form_activeDateKey_key" ON "attendance_form"("activeDateKey");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_record_activeKey_key" ON "attendance_record"("activeKey");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_record_personId_formId_key" ON "attendance_record"("personId", "formId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_score_rule" ADD CONSTRAINT "category_score_rule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "attendance_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_rating_score_rule" ADD CONSTRAINT "compliance_rating_score_rule_complianceRatingId_fkey" FOREIGN KEY ("complianceRatingId") REFERENCES "compliance_rating"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "three_s_performance_score_rule" ADD CONSTRAINT "three_s_performance_score_rule_threeSPerformanceId_fkey" FOREIGN KEY ("threeSPerformanceId") REFERENCES "three_s_performance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_performance_score_rule" ADD CONSTRAINT "sop_performance_score_rule_sopPerformanceId_fkey" FOREIGN KEY ("sopPerformanceId") REFERENCES "sop_performance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_form" ADD CONSTRAINT "attendance_form_previousFormId_fkey" FOREIGN KEY ("previousFormId") REFERENCES "attendance_form"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_formId_fkey" FOREIGN KEY ("formId") REFERENCES "attendance_form"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "attendance_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_complianceRatingId_fkey" FOREIGN KEY ("complianceRatingId") REFERENCES "compliance_rating"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_threeSPerformanceId_fkey" FOREIGN KEY ("threeSPerformanceId") REFERENCES "three_s_performance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_sopPerformanceId_fkey" FOREIGN KEY ("sopPerformanceId") REFERENCES "sop_performance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_formId_fkey" FOREIGN KEY ("formId") REFERENCES "attendance_form"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

