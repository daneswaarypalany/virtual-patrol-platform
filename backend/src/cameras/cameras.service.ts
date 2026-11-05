import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { CreateCameraDto } from './dto/create-camera.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';
import {
  encryptStreamUrl,
  decryptStreamUrl,
  getCameraStreamPath,
  isRtspUrl,
  normalizeStreamUrl,
} from '../common/stream-crypto';

@Injectable()
export class CamerasService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: { id: string; role: string }, siteId?: string) {
    let allowedSiteIds: string[] | null = null;
    if (user.role !== 'ADMIN') {
      const assignments = await this.prisma.operatorSiteAssignment.findMany({
        where: { userId: user.id },
        select: { siteId: true },
      });
      allowedSiteIds = assignments.map((a) => a.siteId);
    }

    let where: any = undefined;
    if (siteId && allowedSiteIds) {
      where = allowedSiteIds.includes(siteId) ? { siteId } : { siteId: '' };
    } else if (siteId) {
      where = { siteId };
    } else if (allowedSiteIds) {
      where = { siteId: { in: allowedSiteIds } };
    }

    const cameras = await this.prisma.camera.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        site: { select: { id: true, name: true } },
        _count: { select: { checkpoints: true } },
      },
    });

    return cameras.map((camera) => this.toPublicCamera(camera));
  }

  async findOne(id: string) {
    const camera = await this.prisma.camera.findUnique({ where: { id } });
    if (!camera) throw new NotFoundException('Camera not found');
    return camera;
  }

  async create(dto: CreateCameraDto) {
    const streamUrl = dto.streamUrl?.trim()
      ? normalizeStreamUrl(dto.streamUrl)
      : null;
    const camera = await this.prisma.$transaction(async (tx) => {
      const created = await tx.camera.create({
        data: {
          name: dto.name,
          cameraCode: dto.cameraCode,
          siteId: dto.siteId,
          location: dto.location,
          streamUrl: null,
          streamUrlEncrypted: streamUrl ? encryptStreamUrl(streamUrl) : null,
        },
      });

      if (isRtspUrl(streamUrl)) {
        await this.queueProvisioning(created.id, created.siteId, created.streamVersion, 'UPSERT', tx);
      }
      return created;
    });
    return this.toPublicCamera(camera);
  }

  async update(id: string, dto: UpdateCameraDto) {
    const existing = await this.findOne(id);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.cameraCode !== undefined) data.cameraCode = dto.cameraCode;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.status !== undefined) data.status = dto.status;

    let nextSource: string | null = decryptStreamUrl(
      existing.streamUrlEncrypted || existing.streamUrl,
    );
    let sourceChanged = false;
    if (dto.streamUrl !== undefined && dto.streamUrl.trim()) {
      const normalized = normalizeStreamUrl(dto.streamUrl);
      sourceChanged = normalized !== nextSource;
      if (sourceChanged) {
        data.streamUrl = null;
        data.streamUrlEncrypted = encryptStreamUrl(normalized);
        data.streamVersion = existing.streamVersion + 1;
        nextSource = normalized;
      }
    }

    const previousWasRtsp = isRtspUrl(
      decryptStreamUrl(existing.streamUrlEncrypted || existing.streamUrl),
    );
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.camera.update({
        where: { id },
        data: data as any,
      });

      if (sourceChanged) {
        if (isRtspUrl(nextSource)) {
          await this.queueProvisioning(id, existing.siteId, saved.streamVersion, 'UPSERT', tx);
        } else if (previousWasRtsp) {
          await this.queueProvisioning(id, existing.siteId, saved.streamVersion, 'REMOVE', tx);
        }
      }
      return saved;
    });

    return this.toPublicCamera(updated);
  }

  async remove(id: string) {
    const camera = await this.findOne(id);

    const inUse = await this.prisma.routeCheckpoint.count({
      where: { cameraId: id },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        `This camera is used in ${inUse} route checkpoint(s) and cannot be deleted. Remove it from those routes first.`,
      );
    }

    const source = decryptStreamUrl(camera.streamUrlEncrypted || camera.streamUrl);
    await this.prisma.$transaction(async (tx) => {
      if (isRtspUrl(source)) {
        await this.queueProvisioning(id, camera.siteId, camera.streamVersion + 1, 'REMOVE', tx);
      }
      await tx.camera.delete({ where: { id } });
    });
    return { message: 'Camera deleted' };
  }

  private async queueProvisioning(
    cameraId: string,
    siteId: string,
    version: number,
    action: 'UPSERT' | 'REMOVE',
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    await client.cameraProvisioningJob.updateMany({
      where: {
        cameraId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    await client.cameraProvisioningJob.create({
      data: {
        cameraId,
        siteId,
        action,
        streamPath: getCameraStreamPath(cameraId),
        version,
        status: 'PENDING',
      },
    });
  }

  private toPublicCamera<T extends {
    streamUrl?: string | null;
    streamUrlEncrypted?: string | null;
  }>(camera: T) {
    const { streamUrl: _legacy, streamUrlEncrypted: _encrypted, ...safe } = camera;
    return {
      ...safe,
      streamUrl: null,
      hasStream: Boolean(_legacy || _encrypted),
    };
  }
}
