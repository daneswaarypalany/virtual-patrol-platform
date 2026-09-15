import { Module } from '@nestjs/common';
import { ReportTemplateController } from './report-template.controller';
import { ReportTemplateService } from './report-template.service';

@Module({
  controllers: [ReportTemplateController],
  providers: [ReportTemplateService],
  exports: [ReportTemplateService],
})
export class ReportTemplateModule {}