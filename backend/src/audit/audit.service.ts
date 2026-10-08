import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Stable action codes stored in AuditLog.action. The human-readable label
// is what the Activity Log shows (the frontend keeps the same map).
export const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
  PATROL_START: 'Started virtual patrol',
  PATROL_CHECKPOINT: 'Reviewed camera checkpoint',
  PATROL_DRAFT: 'Saved patrol draft',
  PATROL_COMPLETE: 'Completed virtual patrol',
  PATROL_DISCARD: 'Discarded patrol',
  PATROL_RELEASE: 'Released patrol lock',
  PATROL_DELETE: 'Deleted patrol',
  CAMERA_VIEW: 'Viewed live camera feed',
  REPORT_VIEW: 'Viewed patrol report',
  REPORT_BULK_DOWNLOAD: 'Downloaded patrol reports',
  REPORT_SUMMARY: 'Generated summary report',
  COMMUNICATION_CREATED: 'Added site notification channel',
  COMMUNICATION_UPDATED: 'Updated site notification channel',
  COMMUNICATION_DELETED: 'Removed site notification channel',
  COMMUNICATION_TESTED: 'Tested site notification channel',
};

export type AuditAction = keyof typeof ACTION_LABELS;

// Don't log the same user opening the same camera feed again within this
// window (the player reconnects/refreshes the playlist often).
const CAMERA_VIEW_DEDUPE_MS = 2 * 60 * 1000;

export interface JobContext {
  routeName: string;
  siteName: string;
  siteId: string;
  operatorName: string;
  total: number;
  done: number;
  clear: number;
}

function quote(value: string | null | undefined): string {
  return `"${value ?? 'Unknown'}"`;
}

function summariseNames(names: string[], max = 4): string {
  const unique = Array.from(new Set(names));
  if (unique.length <= max) return unique.join(', ');
  return `${unique.slice(0, max).join(', ')} +${unique.length - max} more`;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  // Audit logging must never break the request it describes, so every
  // write is wrapped and failures are only logged to the server console.
  async record(
    userId: string | null,
    action: AuditAction,
    entity: string,
    entityId: string | null,
    details: string,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: { action, entity, entityId, userId, details },
      });
    } catch (err) {
      this.logger.warn(`Failed to write audit log (${action}): ${err}`);
    }
  }

  // Reads the job's route/site/progress. Call BEFORE deleting a job if you
  // want to log it afterwards.
  async snapshotJob(jobId: string): Promise<JobContext | null> {
    try {
      const job = await this.prisma.patrolJob.findUnique({
        where: { id: jobId },
        include: {
          operator: { select: { fullName: true } },
          route: {
            include: {
              site: { select: { id: true, name: true } },
              _count: { select: { checkpoints: true } },
            },
          },
          results: { select: { allClear: true } },
        },
      });
      if (!job) return null;
      return {
        routeName: job.route.name,
        siteName: job.route.site.name,
        siteId: job.route.site.id,
        operatorName: job.operator.fullName,
        total: job.route._count.checkpoints,
        done: job.results.length,
        clear: job.results.filter((r) => r.allClear).length,
      };
    } catch (err) {
      this.logger.warn(`snapshotJob failed: ${err}`);
      return null;
    }
  }

  // ---------- Patrols ----------

  async patrolStarted(userId: string, routeId: string, jobId?: string) {
    try {
      const route = await this.prisma.route.findUnique({
        where: { id: routeId },
        include: {
          site: { select: { name: true } },
          _count: { select: { checkpoints: true } },
        },
      });
      if (!route) return;
      await this.record(
        userId,
        'PATROL_START',
        'PatrolJob',
        jobId ?? null,
        `Started a virtual patrol of route ${quote(route.name)} at site ${quote(route.site.name)} (${route._count.checkpoints} checkpoints).`,
      );
    } catch (err) {
      this.logger.warn(`patrolStarted failed: ${err}`);
    }
  }

  async checkpointReviewed(
    userId: string,
    jobId: string,
    routeCheckpointId: string,
    allClear: boolean,
    hasScreenshot: boolean,
    comment?: string,
  ) {
    try {
      const cp = await this.prisma.routeCheckpoint.findUnique({
        where: { id: routeCheckpointId },
        include: {
          camera: { select: { name: true, cameraCode: true, location: true } },
          route: {
            include: {
              site: { select: { name: true } },
              _count: { select: { checkpoints: true } },
            },
          },
        },
      });
      if (!cp) return;

      const where = cp.camera.location ? ` (${cp.camera.location})` : '';
      const outcome = allClear ? 'all clear' : 'issues flagged';
      const shot = hasScreenshot ? ', screenshot attached' : '';
      const note = comment?.trim()
        ? ` Comment: "${comment.trim().slice(0, 120)}${comment.trim().length > 120 ? '…' : ''}"`
        : '';

      await this.record(
        userId,
        'PATROL_CHECKPOINT',
        'PatrolJob',
        jobId,
        `Checked camera ${quote(cp.camera.name)}${where} at site ${quote(cp.route.site.name)}, checkpoint ${cp.orderIndex + 1} of ${cp.route._count.checkpoints} on route ${quote(cp.route.name)}: ${outcome}${shot}.${note}`,
      );
    } catch (err) {
      this.logger.warn(`checkpointReviewed failed: ${err}`);
    }
  }

  async patrolDraftSaved(userId: string, jobId: string) {
    const ctx = await this.snapshotJob(jobId);
    if (!ctx) return;
    await this.record(
      userId,
      'PATROL_DRAFT',
      'PatrolJob',
      jobId,
      `Saved a draft of the patrol on route ${quote(ctx.routeName)} at site ${quote(ctx.siteName)} (${ctx.done} of ${ctx.total} checkpoints done).`,
    );
  }

  async patrolCompleted(userId: string, jobId: string) {
    const ctx = await this.snapshotJob(jobId);
    if (!ctx) return;
    const issues = ctx.done - ctx.clear;
    await this.record(
      userId,
      'PATROL_COMPLETE',
      'PatrolJob',
      jobId,
      `Completed the patrol on route ${quote(ctx.routeName)} at site ${quote(ctx.siteName)}: ${ctx.done} of ${ctx.total} checkpoints reviewed, ${ctx.clear} clear, ${issues} with issues.`,
    );
  }

  async patrolDiscarded(userId: string, siteId: string) {
    try {
      const site = await this.prisma.site.findUnique({
        where: { id: siteId },
        select: { name: true },
      });
      await this.record(
        userId,
        'PATROL_DISCARD',
        'Site',
        siteId,
        `Discarded their in-progress patrol at site ${quote(site?.name)}.`,
      );
    } catch (err) {
      this.logger.warn(`patrolDiscarded failed: ${err}`);
    }
  }

  async patrolAdminAction(
    userId: string,
    action: 'PATROL_RELEASE' | 'PATROL_DELETE',
    jobId: string,
    ctx: JobContext | null,
  ) {
    const who = ctx ? `${ctx.operatorName}'s ` : '';
    const what = ctx
      ? `patrol on route ${quote(ctx.routeName)} at site ${quote(ctx.siteName)}`
      : 'patrol';
    const verb =
      action === 'PATROL_RELEASE'
        ? 'Released the site lock on'
        : 'Deleted';
    await this.record(userId, action, 'PatrolJob', jobId, `${verb} ${who}${what}.`);
  }

  // ---------- Cameras ----------

  async cameraViewed(userId: string, cameraId: string) {
    try {
      const recent = await this.prisma.auditLog.findFirst({
        where: {
          userId,
          action: 'CAMERA_VIEW',
          entityId: cameraId,
          createdAt: { gte: new Date(Date.now() - CAMERA_VIEW_DEDUPE_MS) },
        },
        select: { id: true },
      });
      if (recent) return;

      const camera = await this.prisma.camera.findUnique({
        where: { id: cameraId },
        include: { site: { select: { name: true } } },
      });
      if (!camera) return;

      const where = camera.location ? ` (${camera.location})` : '';
      await this.record(
        userId,
        'CAMERA_VIEW',
        'Camera',
        cameraId,
        `Opened the live feed of camera ${quote(camera.name)} [${camera.cameraCode}]${where} at site ${quote(camera.site.name)}.`,
      );
    } catch (err) {
      this.logger.warn(`cameraViewed failed: ${err}`);
    }
  }

  // ---------- Reports ----------

  async reportViewed(userId: string, jobId: string) {
    const ctx = await this.snapshotJob(jobId);
    if (!ctx) return;
    await this.record(
      userId,
      'REPORT_VIEW',
      'PatrolJob',
      jobId,
      `Viewed the patrol report for route ${quote(ctx.routeName)} at site ${quote(ctx.siteName)} (patrol by ${ctx.operatorName}).`,
    );
  }

  private async siteNamesForJobs(jobIds: string[]): Promise<string[]> {
    const jobs = await this.prisma.patrolJob.findMany({
      where: { id: { in: jobIds } },
      select: { route: { select: { site: { select: { name: true } } } } },
    });
    return jobs.map((j) => j.route.site.name);
  }

  async reportsDownloaded(userId: string, jobIds: string[], format: string) {
    try {
      const sites = await this.siteNamesForJobs(jobIds);
      const kind = format === 'pdf' ? 'one merged PDF' : 'a ZIP of PDFs';
      await this.record(
        userId,
        'REPORT_BULK_DOWNLOAD',
        'PatrolJob',
        null,
        `Downloaded ${jobIds.length} patrol reports as ${kind}. Sites: ${summariseNames(sites) || 'n/a'}.`,
      );
    } catch (err) {
      this.logger.warn(`reportsDownloaded failed: ${err}`);
    }
  }

  async summaryGenerated(userId: string, jobIds: string[]) {
    try {
      const sites = await this.siteNamesForJobs(jobIds);
      await this.record(
        userId,
        'REPORT_SUMMARY',
        'PatrolJob',
        null,
        `Generated a summary report covering ${jobIds.length} patrols. Sites: ${summariseNames(sites) || 'n/a'}.`,
      );
    } catch (err) {
      this.logger.warn(`summaryGenerated failed: ${err}`);
    }
  }
}