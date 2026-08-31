# ============================================================
# Virtual Patrol - Module F (Patrol Execution) backend
# Run from the backend folder:
#   powershell -ExecutionPolicy Bypass -File .\setup-patrol.ps1
# Creates the patrol module (operator-scoped, screenshot uploads).
# After: add PatrolModule to app.module.ts, then start the server.
# ============================================================

Write-Host "Creating folders..." -ForegroundColor Cyan
foreach ($d in @("src\patrol", "src\patrol\dto")) {
  if (-not (Test-Path $d -PathType Container)) {
    New-Item -ItemType Directory -Path $d -Force | Out-Null
  }
}
# uploads folder for screenshots
if (-not (Test-Path "uploads\screenshots" -PathType Container)) {
  New-Item -ItemType Directory -Path "uploads\screenshots" -Force | Out-Null
}

Write-Host "Writing files..." -ForegroundColor Cyan

# ---------- dto/checkpoint-result.dto.ts ----------
@'
import { IsString, IsBoolean, IsOptional } from "class-validator";

export class SaveCheckpointDto {
  @IsString()
  checkpointId: string;

  // "true" / "false" as string because it comes via multipart form-data
  @IsString()
  allClear: string;

  // JSON string of checklist item states
  @IsOptional()
  @IsString()
  checklistState?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
'@ | Set-Content -Path "src\patrol\dto\checkpoint-result.dto.ts" -Encoding UTF8

# ---------- dto/start-patrol.dto.ts ----------
@'
import { IsString, IsNotEmpty } from "class-validator";

export class StartPatrolDto {
  @IsString()
  @IsNotEmpty()
  routeId: string;
}
'@ | Set-Content -Path "src\patrol\dto\start-patrol.dto.ts" -Encoding UTF8

# ---------- patrol.service.ts ----------
@'
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PatrolService {
  constructor(private prisma: PrismaService) {}

  // Sites this operator is assigned to
  async mySites(operatorId: string) {
    const assignments = await this.prisma.operatorSiteAssignment.findMany({
      where: { userId: operatorId },
      include: { site: true },
    });
    return assignments.map((a) => a.site).filter((s) => s.isActive);
  }

  // Routes for a site the operator is assigned to
  async routesForSite(operatorId: string, siteId: string) {
    await this.assertAssigned(operatorId, siteId);
    return this.prisma.route.findMany({
      where: { siteId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { checkpoints: true } } },
    });
  }

  // Start a patrol on a route (must be on an assigned site)
  async start(operatorId: string, routeId: string) {
    const route = await this.prisma.route.findUnique({
      where: { id: routeId },
      include: {
        site: true,
        checkpoints: {
          orderBy: { orderIndex: "asc" },
          include: {
            camera: true,
            checklistTemplate: {
              include: { items: { orderBy: { orderIndex: "asc" } } },
            },
          },
        },
      },
    });
    if (!route) throw new NotFoundException("Route not found");
    await this.assertAssigned(operatorId, route.siteId);

    const job = await this.prisma.patrolJob.create({
      data: { routeId, operatorId },
    });

    return { job, route };
  }

  // Fetch a job (for resume + summary). Operator can only see their own.
  async getJob(operatorId: string, jobId: string) {
    const job = await this.prisma.patrolJob.findUnique({
      where: { id: jobId },
      include: {
        route: {
          include: {
            site: true,
            checkpoints: {
              orderBy: { orderIndex: "asc" },
              include: {
                camera: true,
                checklistTemplate: {
                  include: { items: { orderBy: { orderIndex: "asc" } } },
                },
              },
            },
          },
        },
        results: true,
      },
    });
    if (!job) throw new NotFoundException("Patrol job not found");
    if (job.operatorId !== operatorId) {
      throw new ForbiddenException("Not your patrol job");
    }
    return job;
  }

  // Save a checkpoint result (with optional screenshot path)
  async saveCheckpoint(
    operatorId: string,
    jobId: string,
    data: {
      checkpointId: string;
      allClear: boolean;
      checklistState?: any;
      comment?: string;
      screenshotPath?: string;
    },
  ) {
    const job = await this.prisma.patrolJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException("Patrol job not found");
    if (job.operatorId !== operatorId) {
      throw new ForbiddenException("Not your patrol job");
    }

    // Issue path requires a comment
    if (!data.allClear && (!data.comment || !data.comment.trim())) {
      throw new BadRequestException(
        "A comment is required when an issue is flagged",
      );
    }

    // Upsert-style: one result per checkpoint per job
    const existing = await this.prisma.checkpointResult.findFirst({
      where: { jobId, checkpointId: data.checkpointId },
    });

    if (existing) {
      return this.prisma.checkpointResult.update({
        where: { id: existing.id },
        data: {
          allClear: data.allClear,
          checklistState: data.checklistState,
          comment: data.comment,
          screenshotPath: data.screenshotPath ?? existing.screenshotPath,
        },
      });
    }

    return this.prisma.checkpointResult.create({
      data: {
        jobId,
        checkpointId: data.checkpointId,
        allClear: data.allClear,
        checklistState: data.checklistState,
        comment: data.comment,
        screenshotPath: data.screenshotPath,
      },
    });
  }

  // Complete the patrol
  async complete(operatorId: string, jobId: string) {
    const job = await this.prisma.patrolJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException("Patrol job not found");
    if (job.operatorId !== operatorId) {
      throw new ForbiddenException("Not your patrol job");
    }

    return this.prisma.patrolJob.update({
      where: { id: jobId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }

  private async assertAssigned(operatorId: string, siteId: string) {
    const assignment = await this.prisma.operatorSiteAssignment.findFirst({
      where: { userId: operatorId, siteId },
    });
    if (!assignment) {
      throw new ForbiddenException("You are not assigned to this site");
    }
  }
}
'@ | Set-Content -Path "src\patrol\patrol.service.ts" -Encoding UTF8

# ---------- patrol.controller.ts ----------
@'
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PatrolService } from "./patrol.service";
import { StartPatrolDto } from "./dto/start-patrol.dto";
import { SaveCheckpointDto } from "./dto/checkpoint-result.dto";

@Controller("patrol")
@UseGuards(JwtAuthGuard)
export class PatrolController {
  constructor(private patrolService: PatrolService) {}

  @Get("my-sites")
  mySites(@Req() req: Request) {
    return this.patrolService.mySites((req.user as any).id);
  }

  @Get("routes")
  routes(@Req() req: Request, @Query("siteId") siteId: string) {
    return this.patrolService.routesForSite((req.user as any).id, siteId);
  }

  @Post("start")
  start(@Req() req: Request, @Body() dto: StartPatrolDto) {
    return this.patrolService.start((req.user as any).id, dto.routeId);
  }

  @Get(":jobId")
  getJob(@Req() req: Request, @Param("jobId") jobId: string) {
    return this.patrolService.getJob((req.user as any).id, jobId);
  }

  @Post(":jobId/checkpoint")
  @UseInterceptors(
    FileInterceptor("screenshot", {
      storage: diskStorage({
        destination: "./uploads/screenshots",
        filename: (_req, file, cb) => {
          const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
          cb(null, unique + extname(file.originalname || ".png"));
        },
      }),
    }),
  )
  saveCheckpoint(
    @Req() req: Request,
    @Param("jobId") jobId: string,
    @Body() dto: SaveCheckpointDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.patrolService.saveCheckpoint((req.user as any).id, jobId, {
      checkpointId: dto.checkpointId,
      allClear: dto.allClear === "true",
      checklistState: dto.checklistState
        ? JSON.parse(dto.checklistState)
        : undefined,
      comment: dto.comment,
      screenshotPath: file ? "screenshots/" + file.filename : undefined,
    });
  }

  @Post(":jobId/complete")
  complete(@Req() req: Request, @Param("jobId") jobId: string) {
    return this.patrolService.complete((req.user as any).id, jobId);
  }
}
'@ | Set-Content -Path "src\patrol\patrol.controller.ts" -Encoding UTF8

# ---------- patrol.module.ts ----------
@'
import { Module } from "@nestjs/common";
import { PatrolController } from "./patrol.controller";
import { PatrolService } from "./patrol.service";

@Module({
  controllers: [PatrolController],
  providers: [PatrolService],
})
export class PatrolModule {}
'@ | Set-Content -Path "src\patrol\patrol.module.ts" -Encoding UTF8

Write-Host ""
Write-Host "Done. Patrol module created." -ForegroundColor Green
Write-Host "NEXT: add PatrolModule to app.module.ts, then npm run start:dev" -ForegroundColor Green
