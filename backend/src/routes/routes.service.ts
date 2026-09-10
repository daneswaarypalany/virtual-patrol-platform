import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

    return this.prisma.$transaction(async (tx) => {
      if (dto.checkpoints) {
        const existing = await tx.routeCheckpoint.findMany({
          where: { routeId: id },
          orderBy: { orderIndex: 'asc' },
        });
        const incoming = dto.checkpoints;

        // Reuse existing checkpoint rows in place (by position) instead of
        // deleting and recreating them, so any patrol history
        // (CheckpointResult) already attached to a checkpoint stays valid.
        const keepCount = Math.min(existing.length, incoming.length);
        for (let i = 0; i < keepCount; i++) {
          await tx.routeCheckpoint.update({
            where: { id: existing[i].id },
            data: {
              orderIndex: i,
              cameraId: incoming[i].cameraId,
              checklistTemplateId: incoming[i].checklistTemplateId,
            },
          });
        }

        // More checkpoints than before: create the extra ones.
        if (incoming.length > existing.length) {
          await tx.routeCheckpoint.createMany({
            data: incoming.slice(existing.length).map((cp, idx) => ({
              routeId: id,
              orderIndex: existing.length + idx,
              cameraId: cp.cameraId,
              checklistTemplateId: cp.checklistTemplateId,
            })),
          });
        }

        // Fewer checkpoints than before: only remove the extra ones if they
        // have no patrol history yet -- deleting one that does would violate
        // the CheckpointResult foreign key and break the whole save.
        if (incoming.length < existing.length) {
          const toRemove = existing.slice(incoming.length);
          const toRemoveIds = toRemove.map((cp) => cp.id);
          const historyCount = await tx.checkpointResult.count({
            where: { checkpointId: { in: toRemoveIds } },
          });
          if (historyCount > 0) {
            throw new BadRequestException(
              'One or more removed checkpoints already have patrol history and cannot be deleted. Keep the same number of checkpoints, or move the ones with history to the end instead of removing them.',
            );
          }
          await tx.routeCheckpoint.deleteMany({
            where: { id: { in: toRemoveIds } },
          });
        }
      }

      return tx.route.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          estimatedMinutes: dto.estimatedMinutes,
        },
        include: routeInclude,
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    const jobCount = await this.prisma.patrolJob.count({
      where: { routeId: id },
    });
    if (jobCount > 0) {
      throw new BadRequestException(
        `This route has ${jobCount} patrol record(s) and cannot be deleted. Routes with patrol history are kept for audit purposes.`,
      );
    }

    await this.prisma.route.delete({ where: { id } });
    return { message: 'Route deleted' };
  }
}