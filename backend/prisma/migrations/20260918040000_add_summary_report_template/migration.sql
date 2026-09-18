-- CreateTable
CREATE TABLE "SummaryReportTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'summary_default',
    "fields" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SummaryReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SummaryReportTemplate_key_key" ON "SummaryReportTemplate"("key");
