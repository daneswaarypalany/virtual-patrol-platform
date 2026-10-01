import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SummaryReportTemplateService } from './summary-report-template.service';
import { UpdateSummaryReportTemplateDto } from './dto/summary-report-template.dto';

// `summary-template` is the path the frontend's summaryReportTemplateApi
// calls; `summary-report-template` is kept so the old path still works.
@Controller(['summary-template', 'summary-report-template'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SummaryReportTemplateController {
  constructor(private summaryReportTemplateService: SummaryReportTemplateService) {}

  @Get('list')
  list() {
    return this.summaryReportTemplateService.listTemplates();
  }

  // default template, or a specific one via ?id=
  @Get()
  get(@Query('id') id?: string) {
    return this.summaryReportTemplateService.getTemplateById(id);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.summaryReportTemplateService.getTemplateById(id);
  }

  @Post()
  create(@Body() body: { name: string }) {
    return this.summaryReportTemplateService.createTemplate(body.name);
  }

  @Patch(':id/name')
  rename(@Param('id') id: string, @Body() body: { name: string }) {
    return this.summaryReportTemplateService.renameTemplate(id, body.name);
  }

  @Put()
  update(@Body() dto: UpdateSummaryReportTemplateDto) {
    return this.summaryReportTemplateService.updateTemplate(dto.fields);
  }

  @Put(':id')
  updateById(@Param('id') id: string, @Body() dto: UpdateSummaryReportTemplateDto) {
    return this.summaryReportTemplateService.updateTemplateById(id, dto.fields);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.summaryReportTemplateService.deleteTemplate(id);
  }
}