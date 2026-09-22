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
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { SummaryTemplateService } from './summary-template.service'

@Controller('summary-template')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SummaryTemplateController {
  constructor(private svc: SummaryTemplateService) {}

  @Get('list')
  list() { return this.svc.listTemplates() }

  @Get()
  get(@Query('id') id?: string) { return this.svc.getTemplateById(id) }

  @Get(':id')
  getOne(@Param('id') id: string) { return this.svc.getTemplateById(id) }

  @Post()
  create(@Body() body: { name: string }) { return this.svc.createTemplate(body.name) }

  @Patch(':id/name')
  rename(@Param('id') id: string, @Body() body: { name: string }) {
    return this.svc.renameTemplate(id, body.name)
  }

  @Put(':id')
  updateById(
    @Param('id') id: string,
    @Body() body: { fields: { key: string; enabled: boolean }[] },
  ) { return this.svc.updateTemplateById(id, body.fields) }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.svc.deleteTemplate(id) }
}