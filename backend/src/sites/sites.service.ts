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

    await this.prisma.$transaction(async (tx) => {
      // 1. Routes belonging to this site
      const routes = await tx.route.findMany({
        where: { siteId: id },
        select: { id: true },
      });
      const routeIds = routes.map((r) => r.id);

      // 2. Cameras belonging to this site
      const cameras = await tx.camera.findMany({
        where: { siteId: id },
        select: { id: true },
      });
      const cameraIds = cameras.map((c) => c.id);

      // 3. Patrol jobs on those routes -> clear results, locks, then jobs
      if (routeIds.length) {
        const jobs = await tx.patrolJob.findMany({
          where: { routeId: { in: routeIds } },
          select: { id: true },
        });
        const jobIds = jobs.map((j) => j.id);
        if (jobIds.length) {
          await tx.checkpointResult.deleteMany({
            where: { jobId: { in: jobIds } },
          });
          await tx.activePatrol.deleteMany({
            where: { jobId: { in: jobIds } },
          });
          await tx.patrolJob.deleteMany({ where: { id: { in: jobIds } } });
        }
      }

      // 4. Route checkpoints — reference both routes AND cameras (the blocker)
      const cpWhere: any[] = [];
      if (routeIds.length) cpWhere.push({ routeId: { in: routeIds } });
      if (cameraIds.length) cpWhere.push({ cameraId: { in: cameraIds } });
      if (cpWhere.length) {
        await tx.routeCheckpoint.deleteMany({ where: { OR: cpWhere } });
      }

      // 5. Legacy / non-cascading site relations
      await tx.alert.deleteMany({ where: { siteId: id } });
      await tx.incident.deleteMany({ where: { siteId: id } });
      await tx.patrol.deleteMany({ where: { siteId: id } });
      await tx.activePatrol.deleteMany({ where: { siteId: id } });

      // 6. Now cameras, routes, and assignments cascade cleanly
      await tx.site.delete({ where: { id } });
    });

    return { message: 'Site deleted' };
  }

  // List operators assigned to a site
  async getAssignments(siteId: string) {
    await this.findOne(siteId);
    const assignments = await this.prisma.operatorSiteAssignment.findMany({
      where: { siteId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
            status: true,
          },
        },
      },
    });
    return assignments.map((a) => a.user);
  }

  // Assign an operator/viewer to a site
  async assignUser(siteId: string, userId: string) {
    await this.findOne(siteId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.operatorSiteAssignment.upsert({
      where: { userId_siteId: { userId, siteId } },
      create: { userId, siteId },
      update: {},
    });

    return { message: 'User assigned to site' };
  }

  // Remove an operator/viewer from a site
  async unassignUser(siteId: string, userId: string) {
    await this.findOne(siteId);
    await this.prisma.operatorSiteAssignment.deleteMany({
      where: { siteId, userId },
    });
    return { message: 'User removed from site' };
  }

    async setTemplate(siteId: string, reportTemplateId: string | null) {
    await this.findOne(siteId);
    return this.prisma.site.update({
      where: { id: siteId },
      data: { reportTemplateId },
    });
  }
}
