import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCameraDto } from "./dto/create-camera.dto";
import { UpdateCameraDto } from "./dto/update-camera.dto";

@Injectable()
export class CamerasService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: { id: string; role: string }, siteId?: string) {
    let allowedSiteIds: string[] | null = null;
    if (user.role !== "ADMIN") {
      const assignments = await this.prisma.operatorSiteAssignment.findMany({
        where: { userId: user.id },
        select: { siteId: true },
      });
      allowedSiteIds = assignments.map((a) => a.siteId);
    }

    let where: any = undefined;
    if (siteId && allowedSiteIds) {
      where = allowedSiteIds.includes(siteId) ? { siteId } : { siteId: "" };
    } else if (siteId) {
      where = { siteId };
    } else if (allowedSiteIds) {
      where = { siteId: { in: allowedSiteIds } };
    }

    return this.prisma.camera.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        site: { select: { id: true, name: true } },
        _count: { select: { checkpoints: true } },
      },
    });
  }

  async findOne(id: string) {
    const camera = await this.prisma.camera.findUnique({ where: { id } });
    if (!camera) throw new NotFoundException("Camera not found");
    return camera;
  }

  create(dto: CreateCameraDto) {
    return this.prisma.camera.create({ data: dto as any });
  }

  async update(id: string, dto: UpdateCameraDto) {
    await this.findOne(id);
    return this.prisma.camera.update({ where: { id }, data: dto as any });
  }

  async remove(id: string) {
    await this.findOne(id);

    const inUse = await this.prisma.routeCheckpoint.count({
      where: { cameraId: id },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        `This camera is used in ${inUse} route checkpoint(s) and cannot be deleted. Remove it from those routes first.`,
      );
    }

    await this.prisma.camera.delete({ where: { id } });
    return { message: "Camera deleted" };
  }
}