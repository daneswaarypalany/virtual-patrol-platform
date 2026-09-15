import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportTemplateService } from './report-template.service';
import { UpdateReportTemplateDto } from './dto/report-template.dto';

@Controller('report-template')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ReportTemplateController {
  constructor(private reportTemplateService: ReportTemplateService) {}

  @Get()
  get() {
    return this.reportTemplateService.getTemplate();
  }

  @Put()
  update(@Body() dto: UpdateReportTemplateDto) {
    return this.reportTemplateService.updateTemplate(dto);
  }
}