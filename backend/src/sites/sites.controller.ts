import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { CreateCommunicationChannelDto } from './dto/create-communication-channel.dto';
import { UpdateCommunicationChannelDto } from './dto/update-communication-channel.dto';

@Controller('sites')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SitesController {
  constructor(private sitesService: SitesService) {}

  @Get()
  findAll() {
    return this.sitesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sitesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSiteDto) {
    return this.sitesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSiteDto) {
    return this.sitesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sitesService.remove(id);
  }

    @Get(':id/assignments')
  getAssignments(@Param('id') id: string) {
    return this.sitesService.getAssignments(id);
  }

  @Post(':id/assignments/:userId')
  assignUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.sitesService.assignUser(id, userId);
  }

  @Delete(':id/assignments/:userId')
  unassignUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.sitesService.unassignUser(id, userId);
  }

    @Patch(':id/template')
    setTemplate(
    @Param('id') id: string,
    @Body() body: { reportTemplateId: string | null },
  ) {
    return this.sitesService.setTemplate(id, body.reportTemplateId);
  }

  // ---------- Communication channels (WhatsApp / Telegram / Email) ----------
  // Inherits the controller-level @Roles('ADMIN') guard above — operators and
  // viewers cannot reach any of these routes.

  @Get(':id/communications')
  listCommunications(@Param('id') id: string) {
    return this.sitesService.listCommunications(id);
  }

  @Post(':id/communications')
  createCommunication(
    @Param('id') id: string,
    @Body() dto: CreateCommunicationChannelDto,
    @Req() req: Request,
  ) {
    return this.sitesService.createCommunication(id, dto, (req.user as any).id);
  }

  @Patch(':id/communications/:channelId')
  updateCommunication(
    @Param('id') id: string,
    @Param('channelId') channelId: string,
    @Body() dto: UpdateCommunicationChannelDto,
    @Req() req: Request,
  ) {
    return this.sitesService.updateCommunication(
      id,
      channelId,
      dto,
      (req.user as any).id,
    );
  }

  @Delete(':id/communications/:channelId')
  removeCommunication(
    @Param('id') id: string,
    @Param('channelId') channelId: string,
    @Req() req: Request,
  ) {
    return this.sitesService.removeCommunication(id, channelId, (req.user as any).id);
  }

  @Post(':id/communications/:channelId/test')
  testCommunication(
    @Param('id') id: string,
    @Param('channelId') channelId: string,
    @Req() req: Request,
  ) {
    return this.sitesService.testCommunication(id, channelId, (req.user as any).id);
  }
}
