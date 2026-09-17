-- AlterTable
ALTER TABLE "ReportTemplate" ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'Default Template';

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "reportTemplateId" TEXT;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_reportTemplateId_fkey" FOREIGN KEY ("reportTemplateId") REFERENCES "ReportTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
