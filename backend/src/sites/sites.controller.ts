import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

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
  
}
