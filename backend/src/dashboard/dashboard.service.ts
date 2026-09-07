import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getData(user: { id: string; role: string }) {
    const isAdmin = user.role === "ADMIN";

    // For operators, restrict to their assigned sites
    let siteIds: string[] | null = null;
    if (!isAdmin) {
      const assignments = await this.prisma.operatorSiteAssignment.findMany({
        where: { userId: user.id },
        select: { siteId: true },
      });
      siteIds = assignments.map((a) => a.siteId);
    }

    // Scope helper for jobs (by route.siteId for operators, or own jobs)
    const jobWhere = isAdmin ? {} : { operatorId: user.id };

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // --- Stat counts ---
    const [cameraCount, siteCount, activePatrols, completedToday] =
      await Promise.all([
        this.prisma.camera.count(
          siteIds ? { where: { siteId: { in: siteIds } } } : undefined,
        ),
        isAdmin
          ? this.prisma.site.count()
          : Promise.resolve(siteIds ? siteIds.length : 0),
        this.prisma.patrolJob.count({
          where: { ...jobWhere, status: "IN_PROGRESS" },
        }),
        this.prisma.patrolJob.count({
          where: {
            ...jobWhere,
            status: "COMPLETED",
            completedAt: { gte: startOfDay },
          },
        }),
      ]);

    // Issues flagged (checkpoint results with allClear = false)
    const issuesFlagged = await this.prisma.checkpointResult.count({
      where: {
        allClear: false,
        job: isAdmin ? {} : { operatorId: user.id },
      },
    });

    // Total checkpoint results (all checks done) — denominator for the ratio
    const totalChecks = await this.prisma.checkpointResult.count({
      where: {
        job: isAdmin ? {} : { operatorId: user.id },
      },
    });

    // --- Recent activity: latest jobs (started/completed) ---
    const recentJobs = await this.prisma.patrolJob.findMany({
      where: jobWhere,
      orderBy: { lastActivityAt: "desc" },
      take: 8,
      include: {
        route: { include: { site: { select: { name: true } } } },
        operator: { select: { fullName: true } },
        _count: { select: { results: true } },
      },
    });

    // --- Recent flagged issues ---
    const recentIssues = await this.prisma.checkpointResult.findMany({
      where: {
        allClear: false,
        job: isAdmin ? {} : { operatorId: user.id },
      },
      orderBy: { completedAt: "desc" },
      take: 8,
      include: {
        checkpoint: { include: { camera: { select: { name: true } } } },
        job: {
          include: {
            route: { include: { site: { select: { name: true } } } },
            operator: { select: { fullName: true } },
          },
        },
      },
    });

    // Build a unified timeline
    const timeline = [
      ...recentJobs.map((j) => ({
        type: j.status === "COMPLETED" ? "completed" : "started",
        at: j.lastActivityAt,
        title:
          j.status === "COMPLETED"
            ? "Patrol completed"
            : j.status === "DRAFT"
              ? "Patrol saved as draft"
              : "Patrol in progress",
        detail: `${j.route.name} · ${j.route.site.name} · ${j.operator.fullName}`,
      })),
      ...recentIssues.map((r) => ({
        type: "issue",
        at: r.completedAt,
        title: "Issue flagged",
        detail: `${r.checkpoint.camera.name} · ${r.job.route.site.name}${
          r.comment ? ` — ${r.comment}` : ""
        }`,
      })),
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 12);

    return {
      stats: {
        cameras: cameraCount,
        sites: siteCount,
        activePatrols,
        completedToday,
        issuesFlagged,
        totalChecks,
      },
      timeline,
    };
  }
}