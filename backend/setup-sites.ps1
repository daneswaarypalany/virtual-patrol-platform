# ============================================================
# Virtual Patrol - Module B (Sites) backend setup
# Run from the backend folder:  cd backend  then
#   powershell -ExecutionPolicy Bypass -File .\setup-sites.ps1
# Creates the sites module (controller, service, DTOs, module).
# Does NOT touch app.module.ts - you add SitesModule there manually.
# ============================================================

Write-Host "Cleaning any fake folders..." -ForegroundColor Cyan
$fake = @(
  "src\sites\sites.module.ts",
  "src\sites\sites.controller.ts",
  "src\sites\sites.service.ts",
  "src\sites\dto\create-site.dto.ts",
  "src\sites\dto\update-site.dto.ts"
)
foreach ($f in $fake) {
  if (Test-Path $f -PathType Container) {
    Remove-Item $f -Recurse -Force
    Write-Host "  removed fake folder: $f" -ForegroundColor Yellow
  }
}

Write-Host "Creating folders..." -ForegroundColor Cyan
foreach ($d in @("src\sites", "src\sites\dto")) {
  if (-not (Test-Path $d -PathType Container)) {
    New-Item -ItemType Directory -Path $d -Force | Out-Null
  }
}

Write-Host "Writing files..." -ForegroundColor Cyan

# ---------- dto/create-site.dto.ts ----------
@'
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateSiteDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
'@ | Set-Content -Path "src\sites\dto\create-site.dto.ts" -Encoding UTF8

# ---------- dto/update-site.dto.ts ----------
@'
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateSiteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
'@ | Set-Content -Path "src\sites\dto\update-site.dto.ts" -Encoding UTF8

# ---------- sites.service.ts ----------
@'
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.site.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { cameras: true, assignments: true } },
      },
    });
  }

  async findOne(id: string) {
    const site = await this.prisma.site.findUnique({
      where: { id },
      include: {
        _count: { select: { cameras: true, assignments: true } },
      },
    });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  create(dto: CreateSiteDto) {
    return this.prisma.site.create({ data: dto });
  }

  async update(id: string, dto: UpdateSiteDto) {
    await this.findOne(id);
    return this.prisma.site.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.site.delete({ where: { id } });
    return { message: 'Site deleted' };
  }
}
'@ | Set-Content -Path "src\sites\sites.service.ts" -Encoding UTF8

# ---------- sites.controller.ts ----------
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
}
'@ | Set-Content -Path "src\sites\sites.controller.ts" -Encoding UTF8

# ---------- sites.module.ts ----------
@'
import { Module } from '@nestjs/common';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  controllers: [SitesController],
  providers: [SitesService],
})
export class SitesModule {}
'@ | Set-Content -Path "src\sites\sites.module.ts" -Encoding UTF8

Write-Host ""
Write-Host "Done. Sites files created." -ForegroundColor Green
Write-Host "NEXT: add SitesModule to src\app.module.ts imports, then npm run start:dev" -ForegroundColor Green
