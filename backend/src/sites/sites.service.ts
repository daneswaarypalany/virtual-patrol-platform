import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { CreateCommunicationChannelDto } from './dto/create-communication-channel.dto';
import { UpdateCommunicationChannelDto } from './dto/update-communication-channel.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SitesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

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

  // ---------- Site communication channels (WhatsApp / Telegram / Email) ----------
  // Each channel belongs to exactly one site (siteId + channelType unique), so
  // resolving a site's channels can never leak another site's destinations.

  async listCommunications(siteId: string) {
    await this.findOne(siteId);
    return this.prisma.siteCommunicationChannel.findMany({
      where: { siteId },
      orderBy: { channelType: 'asc' },
    });
  }

  async createCommunication(
    siteId: string,
    dto: CreateCommunicationChannelDto,
    userId: string,
  ) {
    await this.findOne(siteId);
    const channel = await this.prisma.siteCommunicationChannel.create({
      data: {
        siteId,
        channelType: dto.channelType,
        destination: dto.destination,
        displayName: dto.displayName,
        enabled: dto.enabled ?? false,
      },
    });

    await this.logAudit('COMMUNICATION_CREATED', siteId, userId, {
      channelId: channel.id,
      channelType: channel.channelType,
    });

    return channel;
  }

  async updateCommunication(
    siteId: string,
    channelId: string,
    dto: UpdateCommunicationChannelDto,
    userId: string,
  ) {
    const channel = await this.findCommunication(siteId, channelId);

    const updated = await this.prisma.siteCommunicationChannel.update({
      where: { id: channel.id },
      data: dto,
    });

    await this.logAudit('COMMUNICATION_UPDATED', siteId, userId, {
      channelId: channel.id,
      channelType: channel.channelType,
    });

    return updated;
  }

  async removeCommunication(siteId: string, channelId: string, userId: string) {
    const channel = await this.findCommunication(siteId, channelId);

    await this.prisma.siteCommunicationChannel.delete({
      where: { id: channel.id },
    });

    await this.logAudit('COMMUNICATION_DELETED', siteId, userId, {
      channelId: channel.id,
      channelType: channel.channelType,
    });

    return { message: 'Communication channel deleted' };
  }

  async testCommunication(siteId: string, channelId: string, userId: string) {
    await this.findCommunication(siteId, channelId);

    const result = await this.notifications.sendTest(siteId, channelId);

    await this.logAudit('COMMUNICATION_TESTED', siteId, userId, {
      channelId,
      status: result.status,
    });

    return result;
  }

  private async findCommunication(siteId: string, channelId: string) {
    const channel = await this.prisma.siteCommunicationChannel.findFirst({
      where: { id: channelId, siteId },
    });
    if (!channel) {
      throw new NotFoundException('Communication channel not found');
    }
    return channel;
  }

  // Never pass secrets/tokens here — only ids, channel types, and outcomes.
  private async logAudit(
    action: string,
    siteId: string,
    userId: string,
    details: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: {
        action,
        entity: 'SiteCommunicationChannel',
        entityId: siteId,
        userId,
        details: JSON.stringify(details),
      },
    });
  }
}
