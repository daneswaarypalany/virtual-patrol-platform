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
import { AuditService } from "../audit/audit.service";
import { StartPatrolDto } from "./dto/start-patrol.dto";
import { SaveCheckpointDto } from "./dto/checkpoint-result.dto";
import { BulkReportDto } from "./dto/bulk-report.dto";
import { SummaryReportDto } from "./dto/summary-report.dto";

// Resolved relative to process.cwd() -- matches main.ts's static file root
// and the report generator's file reads (patrol.service.ts), so uploads,
// serving, and report embedding all agree on the same "uploads" folder.
const UPLOADS_DIR = process.env.VERCEL
  ? join("/tmp", "uploads")
  : join(process.cwd(), "uploads");

const SCREENSHOTS_DIR = join(UPLOADS_DIR, "screenshots");

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

@Controller("patrol")
@UseGuards(JwtAuthGuard)
export class PatrolController {
  constructor(
    private patrolService: PatrolService,
    private audit: AuditService,
  ) {}

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
  async start(@Req() req: Request, @Body() dto: StartPatrolDto) {
    const userId = (req.user as any).id;
    const result = await this.patrolService.start(userId, dto.routeId);
    await this.audit.patrolStarted(userId, dto.routeId, (result as any)?.id);
    return result;
  }

  @Post("discard")
  async discard(@Req() req: Request, @Body() body: { siteId: string }) {
    const userId = (req.user as any).id;
    const result = await this.patrolService.discardMyPatrol(userId, body.siteId);
    if (result.discarded) await this.audit.patrolDiscarded(userId, body.siteId);
    return result;
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
    await this.audit.reportsDownloaded(
      (req.user as any).id,
      dto.jobIds,
      dto.format,
    );
    res.send(buffer);
  }

  // Aggregated summary PDF across several patrols (stats + per-site
  // breakdown + included-patrols table), as opposed to bulkReport above
  // which packages the individual per-patrol reports together.
  @Post("reports/summary")
  async summaryReport(
    @Req() req: Request,
    @Body() dto: SummaryReportDto,
    @Res() res: Response,
  ) {
    const { buffer, contentType } = await this.patrolService.generateSummaryReport(
      req.user as any,
      dto.jobIds,
      dto.templateId,
    );
    res.set({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="patrol-summary-${Date.now()}.pdf"`,
    });
    await this.audit.summaryGenerated((req.user as any).id, dto.jobIds);
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
    await this.audit.reportViewed((req.user as any).id, jobId);
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
  async saveCheckpoint(
    @Req() req: Request,
    @Param("jobId") jobId: string,
    @Body() dto: SaveCheckpointDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const userId = (req.user as any).id;
    const result = await this.patrolService.saveCheckpoint(userId, jobId, {
      checkpointId: dto.checkpointId,
      allClear: dto.allClear === "true",
      checklistState: dto.checklistState
        ? JSON.parse(dto.checklistState)
        : undefined,
      comment: dto.comment,
      screenshotPath: file ? "screenshots/" + file.filename : undefined,
    });
    await this.audit.checkpointReviewed(
      userId,
      jobId,
      dto.checkpointId,
      dto.allClear === "true",
      !!file,
      dto.comment,
    );
    return result;
  }

  @Post(":jobId/draft")
  async saveDraft(@Req() req: Request, @Param("jobId") jobId: string) {
    const userId = (req.user as any).id;
    const result = await this.patrolService.saveDraft(userId, jobId);
    await this.audit.patrolDraftSaved(userId, jobId);
    return result;
  }

  @Post(":jobId/complete")
  async complete(@Req() req: Request, @Param("jobId") jobId: string) {
    const userId = (req.user as any).id;
    const result = await this.patrolService.complete(userId, jobId);
    await this.audit.patrolCompleted(userId, jobId);
    return result;
  }

  @Post(":jobId/release")
  async release(@Req() req: Request, @Param("jobId") jobId: string) {
    const ctx = await this.audit.snapshotJob(jobId);
    const result = await this.patrolService.adminReleaseLock(jobId);
    await this.audit.patrolAdminAction(
      (req.user as any).id,
      "PATROL_RELEASE",
      jobId,
      ctx,
    );
    return result;
  }

  @Post(":jobId/admin-delete")
  async adminDelete(@Req() req: Request, @Param("jobId") jobId: string) {
    const ctx = await this.audit.snapshotJob(jobId);
    const result = await this.patrolService.adminDeletePatrol(jobId);
    await this.audit.patrolAdminAction(
      (req.user as any).id,
      "PATROL_DELETE",
      jobId,
      ctx,
    );
    return result;
  }
}