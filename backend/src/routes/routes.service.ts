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
