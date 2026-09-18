import { Module } from '@nestjs/common';
import { ReportTemplateController } from './report-template.controller';
import { ReportTemplateService } from './report-template.service';
import { SummaryReportTemplateController } from './summary-report-template.controller';
import { SummaryReportTemplateService } from './summary-report-template.service';

@Module({
  controllers: [ReportTemplateController, SummaryReportTemplateController],
  providers: [ReportTemplateService, SummaryReportTemplateService],
  exports: [ReportTemplateService, SummaryReportTemplateService],
})
export class ReportTemplateModule {}