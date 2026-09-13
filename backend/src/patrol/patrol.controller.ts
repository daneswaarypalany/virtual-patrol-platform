import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { mkdirSync } from "fs";
import type { Request, Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PatrolService } from "./patrol.service";
import { StartPatrolDto } from "./dto/start-patrol.dto";
import { SaveCheckpointDto } from "./dto/checkpoint-result.dto";
import { BulkReportDto } from "./dto/bulk-report.dto";

// Resolved relative to process.cwd() -- matches main.ts's static file root
// and the report generator's file reads (patrol.service.ts), so uploads,
// serving, and report embedding all agree on the same "uploads" folder.
const SCREENSHOTS_DIR = join(process.cwd(), "uploads", "screenshots");
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

@Controller("patrol")
@UseGuards(JwtAuthGuard)
export class PatrolController {
  constructor(private patrolService: PatrolService) {}

  // ---- Static routes FIRST (before any :jobId route) ----

  @Get("jobs")
  listJobs(@Req() req: Request) {
    return this.patrolService.listJobs(req.user as any);
  }

  @Get("active")
  listActive(@Req() req: Request) {
    return this.patrolService.listActivePatrols(req.user as any);
  }

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

  @Post("discard")
  discard(@Req() req: Request, @Body() body: { siteId: string }) {
    return this.patrolService.discardMyPatrol((req.user as any).id, body.siteId);
  }

  // ---- :jobId routes (specific paths before the bare catch-all) ----

  // Bulk download: several completed patrol reports as one merged PDF
  // or a zip of individual PDFs. Must stay above ":jobId" routes since
  // it's a static path.
  @Post("reports/bulk")
  async bulkReport(
    @Req() req: Request,
    @Body() dto: BulkReportDto,
    @Res() res: Response,
  ) {
    const { buffer, contentType } = await this.patrolService.generateBulkReport(
      req.user as any,
      dto.jobIds,
      dto.format,
    );
    const ext = dto.format === "pdf" ? "pdf" : "zip";
    res.set({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="patrol-reports-${Date.now()}.${ext}"`,
    });
    res.send(buffer);
  }

  @Get(":jobId/report")
  async report(
    @Req() req: Request,
    @Param("jobId") jobId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.patrolService.generateReport(
      req.user as any,
      jobId,
    );
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="patrol-report-${jobId}.pdf"`,
    });
    res.send(pdf);
  }

  @Get(":jobId")
  getJob(@Req() req: Request, @Param("jobId") jobId: string) {
    return this.patrolService.getJob(req.user as any, jobId);
  }

  @Post(":jobId/checkpoint")
  @UseInterceptors(
    FileInterceptor("screenshot", {
      storage: diskStorage({
        destination: SCREENSHOTS_DIR,
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

  @Post(":jobId/draft")
  saveDraft(@Req() req: Request, @Param("jobId") jobId: string) {
    return this.patrolService.saveDraft((req.user as any).id, jobId);
  }

  @Post(":jobId/complete")
  complete(@Req() req: Request, @Param("jobId") jobId: string) {
    return this.patrolService.complete((req.user as any).id, jobId);
  }

  @Post(":jobId/release")
  release(@Param("jobId") jobId: string) {
    return this.patrolService.adminReleaseLock(jobId);
  }

  @Post(":jobId/admin-delete")
  adminDelete(@Param("jobId") jobId: string) {
    return this.patrolService.adminDeletePatrol(jobId);
  }
}