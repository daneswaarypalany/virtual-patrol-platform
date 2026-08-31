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
import { ChecklistsService } from './checklists.service';
import { CreateChecklistDto, UpdateChecklistDto } from './dto/checklist.dto';

@Controller('checklists')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ChecklistsController {
  constructor(private checklistsService: ChecklistsService) {}

  @Get()
  findAll() {
    return this.checklistsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.checklistsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateChecklistDto) {
    return this.checklistsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateChecklistDto) {
    return this.checklistsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.checklistsService.remove(id);
  }
}
