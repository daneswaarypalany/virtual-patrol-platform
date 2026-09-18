import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SummaryReportTemplateService } from './summary-report-template.service';
import { UpdateSummaryReportTemplateDto } from './dto/summary-report-template.dto';

@Controller('summary-report-template')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SummaryReportTemplateController {
  constructor(private summaryReportTemplateService: SummaryReportTemplateService) {}

  @Get()
  get() {
    return this.summaryReportTemplateService.getTemplate();
  }

  @Put()
  update(@Body() dto: UpdateSummaryReportTemplateDto) {
    return this.summaryReportTemplateService.updateTemplate(dto.fields);
  }
}