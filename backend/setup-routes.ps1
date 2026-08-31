# ============================================================
# Virtual Patrol - Modules D (Routes) + E (Checklists) backend
# Run from the backend folder:
#   powershell -ExecutionPolicy Bypass -File .\setup-routes.ps1
# Creates checklists and routes modules (admin-guarded CRUD).
# After running: add ChecklistsModule and RoutesModule to app.module.ts
# ============================================================

Write-Host "Creating folders..." -ForegroundColor Cyan
foreach ($d in @(
  "src\checklists", "src\checklists\dto",
  "src\routes", "src\routes\dto"
)) {
  if (-not (Test-Path $d -PathType Container)) {
    New-Item -ItemType Directory -Path $d -Force | Out-Null
  }
}

Write-Host "Writing checklist files..." -ForegroundColor Cyan

# ---------- checklists/dto/checklist.dto.ts ----------
@'
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

class ChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  label: string;
}

export class CreateChecklistDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items: ChecklistItemDto[];
}

export class UpdateChecklistDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items?: ChecklistItemDto[];
}
'@ | Set-Content -Path "src\checklists\dto\checklist.dto.ts" -Encoding UTF8

# ---------- checklists/checklists.service.ts ----------
@'
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChecklistDto, UpdateChecklistDto } from './dto/checklist.dto';

@Injectable()
export class ChecklistsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.checklistTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        items: { orderBy: { orderIndex: 'asc' } },
        _count: { select: { checkpoints: true } },
      },
    });
  }

  async findOne(id: string) {
    const t = await this.prisma.checklistTemplate.findUnique({
      where: { id },
      include: { items: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!t) throw new NotFoundException('Checklist template not found');
    return t;
  }

  create(dto: CreateChecklistDto) {
    return this.prisma.checklistTemplate.create({
      data: {
        name: dto.name,
        description: dto.description,
        items: {
          create: dto.items.map((item, i) => ({
            label: item.label,
            orderIndex: i,
          })),
        },
      },
      include: { items: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  async update(id: string, dto: UpdateChecklistDto) {
    await this.findOne(id);

    // If items provided, replace them all (simplest reliable approach)
    if (dto.items) {
      await this.prisma.checklistItem.deleteMany({ where: { templateId: id } });
    }

    return this.prisma.checklistTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        ...(dto.items && {
          items: {
            create: dto.items.map((item, i) => ({
              label: item.label,
              orderIndex: i,
            })),
          },
        }),
      },
      include: { items: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.checklistTemplate.delete({ where: { id } });
    return { message: 'Checklist template deleted' };
  }
}
'@ | Set-Content -Path "src\checklists\checklists.service.ts" -Encoding UTF8

# ---------- checklists/checklists.controller.ts ----------
@'
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
'@ | Set-Content -Path "src\checklists\checklists.controller.ts" -Encoding UTF8

# ---------- checklists/checklists.module.ts ----------
@'
import { Module } from '@nestjs/common';
import { ChecklistsController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';

@Module({
  controllers: [ChecklistsController],
  providers: [ChecklistsService],
})
export class ChecklistsModule {}
'@ | Set-Content -Path "src\checklists\checklists.module.ts" -Encoding UTF8

Write-Host "Writing route files..." -ForegroundColor Cyan

# ---------- routes/dto/route.dto.ts ----------
@'
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

class CheckpointDto {
  @IsString()
  @IsNotEmpty()
  cameraId: string;

  @IsString()
  @IsNotEmpty()
  checklistTemplateId: string;
}

export class CreateRouteDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  siteId: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedMinutes?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckpointDto)
  checkpoints: CheckpointDto[];
}

export class UpdateRouteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedMinutes?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckpointDto)
  checkpoints?: CheckpointDto[];
}
'@ | Set-Content -Path "src\routes\dto\route.dto.ts" -Encoding UTF8

# ---------- routes/routes.service.ts ----------
@'
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRouteDto, UpdateRouteDto } from './dto/route.dto';

const routeInclude = {
  site: { select: { id: true, name: true } },
  checkpoints: {
    orderBy: { orderIndex: 'asc' as const },
    include: {
      camera: { select: { id: true, name: true, location: true } },
      checklistTemplate: { select: { id: true, name: true } },
    },
  },
  _count: { select: { checkpoints: true } },
};

@Injectable()
export class RoutesService {
  constructor(private prisma: PrismaService) {}

  findAll(siteId?: string) {
    return this.prisma.route.findMany({
      where: siteId ? { siteId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: routeInclude,
    });
  }

  async findOne(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: routeInclude,
    });
    if (!route) throw new NotFoundException('Route not found');
    return route;
  }

  create(dto: CreateRouteDto) {
    return this.prisma.route.create({
      data: {
        name: dto.name,
        siteId: dto.siteId,
        description: dto.description,
        estimatedMinutes: dto.estimatedMinutes,
        checkpoints: {
          create: dto.checkpoints.map((cp, i) => ({
            orderIndex: i,
            cameraId: cp.cameraId,
            checklistTemplateId: cp.checklistTemplateId,
          })),
        },
      },
      include: routeInclude,
    });
  }

  async update(id: string, dto: UpdateRouteDto) {
    await this.findOne(id);

    if (dto.checkpoints) {
      await this.prisma.routeCheckpoint.deleteMany({ where: { routeId: id } });
    }

    return this.prisma.route.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        estimatedMinutes: dto.estimatedMinutes,
        ...(dto.checkpoints && {
          checkpoints: {
            create: dto.checkpoints.map((cp, i) => ({
              orderIndex: i,
              cameraId: cp.cameraId,
              checklistTemplateId: cp.checklistTemplateId,
            })),
          },
        }),
      },
      include: routeInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.route.delete({ where: { id } });
    return { message: 'Route deleted' };
  }
}
'@ | Set-Content -Path "src\routes\routes.service.ts" -Encoding UTF8

# ---------- routes/routes.controller.ts ----------
@'
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoutesService } from './routes.service';
import { CreateRouteDto, UpdateRouteDto } from './dto/route.dto';

@Controller('routes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class RoutesController {
  constructor(private routesService: RoutesService) {}

  @Get()
  findAll(@Query('siteId') siteId?: string) {
    return this.routesService.findAll(siteId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.routesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateRouteDto) {
    return this.routesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRouteDto) {
    return this.routesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.routesService.remove(id);
  }
}
'@ | Set-Content -Path "src\routes\routes.controller.ts" -Encoding UTF8

# ---------- routes/routes.module.ts ----------
@'
import { Module } from '@nestjs/common';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

@Module({
  controllers: [RoutesController],
  providers: [RoutesService],
})
export class RoutesModule {}
'@ | Set-Content -Path "src\routes\routes.module.ts" -Encoding UTF8

Write-Host ""
Write-Host "Done. Checklists + Routes modules created." -ForegroundColor Green
Write-Host "NEXT: add ChecklistsModule and RoutesModule to src\app.module.ts, then start the server." -ForegroundColor Green
