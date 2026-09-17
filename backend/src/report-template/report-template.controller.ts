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
import { ReportTemplateService } from './report-template.service';
import { UpdateReportTemplateDto } from './dto/report-template.dto';

@Controller('report-template')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ReportTemplateController {
  constructor(private reportTemplateService: ReportTemplateService) {}

  // List all templates (library page + pickers)
  @Get('list')
  list() {
    return this.reportTemplateService.listTemplates();
  }

  // Get the default template (backward compat) OR a specific one via ?id=
  @Get()
  get(@Query('id') id?: string) {
    return this.reportTemplateService.getTemplateById(id);
  }

  // Get a specific template's full layout by id
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.reportTemplateService.getTemplateById(id);
  }

  // Create a new named template (starts from defaults)
  @Post()
  create(@Body() body: { name: string }) {
    return this.reportTemplateService.createTemplate(body.name);
  }

  // Rename a template
  @Patch(':id/name')
  rename(@Param('id') id: string, @Body() body: { name: string }) {
    return this.reportTemplateService.renameTemplate(id, body.name);
  }

  // Save the DEFAULT template's fields (backward compat)
  @Put()
  update(@Body() dto: UpdateReportTemplateDto) {
    return this.reportTemplateService.updateTemplate(dto);
  }

  // Save a specific template's fields by id
  @Put(':id')
  updateById(@Param('id') id: string, @Body() dto: UpdateReportTemplateDto) {
    return this.reportTemplateService.updateTemplateById(id, dto);
  }

  // Delete a template (not the default)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reportTemplateService.deleteTemplate(id);
  }
}