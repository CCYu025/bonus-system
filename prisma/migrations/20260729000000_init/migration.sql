-- CreateTable
CREATE TABLE "person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "attendance_category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "attendance_form" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousFormId" TEXT,
    "activeDateKey" TEXT,
    "rejectReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "attendance_form_previousFormId_fkey" FOREIGN KEY ("previousFormId") REFERENCES "attendance_form" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "attendance_record" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "categoryId" TEXT,
    "note" TEXT,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "activeKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "attendance_record_formId_fkey" FOREIGN KEY ("formId") REFERENCES "attendance_form" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "attendance_record_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "attendance_record_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "attendance_category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "operatorName" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_formId_fkey" FOREIGN KEY ("formId") REFERENCES "attendance_form" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "person_employeeId_key" ON "person"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_category_code_key" ON "attendance_category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_form_previousFormId_key" ON "attendance_form"("previousFormId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_form_activeDateKey_key" ON "attendance_form"("activeDateKey");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_record_activeKey_key" ON "attendance_record"("activeKey");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_record_personId_formId_key" ON "attendance_record"("personId", "formId");
