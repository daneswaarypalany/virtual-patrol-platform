import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCameraAgentDto } from './dto/create-camera-agent.dto';
import { AgentJobResultDto } from './dto/agent-job-result.dto';
import {
  decryptStreamUrl,
  getCameraStreamPath,
  isRtspUrl,
  redactStreamUrl,
} from '../common/stream-crypto';

const AGENT_STALE_MS = 90_000;
const JOB_LEASE_MS = 120_000;

@Injectable()
export class CameraAgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createAgent(dto: CreateCameraAgentDto) {
    const site = await this.prisma.site.findUnique({
      where: { id: dto.siteId },
      select: { id: true },
    });
    if (!site) throw new NotFoundException('Site not found');

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const agent = await this.prisma.cameraAgent.upsert({
      where: { siteId: dto.siteId },
      create: {
        siteId: dto.siteId,
        name: dto.name,
        tokenHash,
      },
      update: {
        name: dto.name,
        tokenHash,
        lastHeartbeatAt: null,
        playbackBaseUrl: null,
      },
      select: {
        id: true,
        siteId: true,
        name: true,
        createdAt: true,
      },
    });

    return {
      ...agent,
      agentToken: token,
      warning: 'Copy this token now. It is only returned once. Store it in the local agent environment, not in source control.',
    };
  }

  async listAgents(siteId?: string) {
    const agents = await this.prisma.cameraAgent.findMany({
      where: siteId ? { siteId } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        siteId: true,
        name: true,
        playbackBaseUrl: true,
        lastHeartbeatAt: true,
        createdAt: true,
        site: { select: { id: true, name: true } },
      },
    });

    return agents.map((agent) => ({
      ...agent,
      status:
        agent.lastHeartbeatAt &&
        Date.now() - agent.lastHeartbeatAt.getTime() < AGENT_STALE_MS
          ? 'ONLINE'
          : 'OFFLINE',
    }));
  }

  async heartbeat(authorization: string | undefined, playbackBaseUrl: string) {
    const agent = await this.authenticate(authorization);
    const normalizedBaseUrl = this.validatePlaybackBaseUrl(playbackBaseUrl);
    await this.prisma.cameraAgent.update({
      where: { id: agent.id },
      data: {
        lastHeartbeatAt: new Date(),
        playbackBaseUrl: normalizedBaseUrl,
      },
    });
    return { ok: true, serverTime: new Date().toISOString() };
  }

  async nextJob(authorization: string | undefined) {
    const agent = await this.authenticate(authorization);
    await this.prisma.cameraAgent.update({
      where: { id: agent.id },
      data: { lastHeartbeatAt: new Date() },
    });

    const staleBefore = new Date(Date.now() - JOB_LEASE_MS);
    const job = await this.prisma.cameraProvisioningJob.findFirst({
      where: {
        siteId: agent.siteId,
        OR: [
          { status: 'PENDING' },
          { status: 'PROCESSING', claimedAt: { lt: staleBefore } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) return { job: null };

    const claimed = await this.prisma.cameraProvisioningJob.updateMany({
      where: {
        id: job.id,
        OR: [
          { status: 'PENDING' },
          { status: 'PROCESSING', claimedAt: { lt: staleBefore } },
        ],
      },
      data: {
        status: 'PROCESSING',
        agentId: agent.id,
        claimedAt: new Date(),
        errorMessage: null,
      },
    });
    if (claimed.count !== 1) return { job: null };

    let source: string | null = null;
    if (job.action === 'UPSERT') {
      const camera = await this.prisma.camera.findUnique({
        where: { id: job.cameraId },
        select: { streamUrlEncrypted: true, streamUrl: true, streamVersion: true },
      });
      if (!camera || camera.streamVersion !== job.version) {
        await this.prisma.cameraProvisioningJob.update({
          where: { id: job.id },
          data: { status: 'CANCELLED', completedAt: new Date() },
        });
        return { job: null };
      }
      source = decryptStreamUrl(camera.streamUrlEncrypted || camera.streamUrl);
      if (!isRtspUrl(source)) {
        await this.prisma.cameraProvisioningJob.update({
          where: { id: job.id },
          data: { status: 'CANCELLED', completedAt: new Date() },
        });
        return { job: null };
      }
    }

    // The RTSP source is returned only over the agent's authenticated HTTPS poll.
    return {
      job: {
        id: job.id,
        cameraId: job.cameraId,
        action: job.action,
        streamPath: job.streamPath,
        version: job.version,
        source,
      },
    };
  }

  async completeJob(
    authorization: string | undefined,
    jobId: string,
    result: AgentJobResultDto,
  ) {
    const agent = await this.authenticate(authorization);
    const job = await this.prisma.cameraProvisioningJob.findFirst({
      where: { id: jobId, siteId: agent.siteId, agentId: agent.id },
    });
    if (!job || job.status !== 'PROCESSING') {
      throw new NotFoundException('Provisioning job not found');
    }

    const now = new Date();
    const safeError = result.status === 'FAILED' && result.errorMessage
      ? redactStreamUrl(result.errorMessage).slice(0, 500)
      : null;

    await this.prisma.cameraProvisioningJob.update({
      where: { id: jobId },
      data: {
        status: result.status,
        errorMessage: safeError,
        completedAt: now,
      },
    });

    if (job.action === 'UPSERT') {
      const currentCamera = await this.prisma.camera.findUnique({
        where: { id: job.cameraId },
        select: { id: true, streamVersion: true },
      });
      if (currentCamera?.streamVersion === job.version) {
        await this.prisma.camera.update({
          where: { id: job.cameraId },
          data: { status: result.status === 'APPLIED' ? 'ONLINE' : 'OFFLINE' },
        });
      }
    }

    return { ok: true };
  }

  async getAgentPlaybackBaseUrl(siteId: string): Promise<string | null> {
    const agent = await this.prisma.cameraAgent.findUnique({
      where: { siteId },
      select: { playbackBaseUrl: true, lastHeartbeatAt: true },
    });
    if (
      !agent?.playbackBaseUrl ||
      !agent.lastHeartbeatAt ||
      Date.now() - agent.lastHeartbeatAt.getTime() >= AGENT_STALE_MS
    ) {
      return null;
    }
    return agent.playbackBaseUrl;
  }

  async queueLegacyCamera(cameraId: string, siteId: string, version: number) {
    await this.prisma.cameraProvisioningJob.updateMany({
      where: { cameraId, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    await this.prisma.cameraProvisioningJob.create({
      data: {
        cameraId,
        siteId,
        action: 'UPSERT',
        streamPath: getCameraStreamPath(cameraId),
        version,
        status: 'PENDING',
      },
    });
  }

  private async authenticate(authorization?: string) {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token || token.length < 40 || token.length > 200) {
      throw new UnauthorizedException('Invalid camera agent credentials');
    }

    const tokenHash = this.hashToken(token);
    const agent = await this.prisma.cameraAgent.findUnique({
      where: { tokenHash },
    });
    if (!agent) {
      throw new UnauthorizedException('Invalid camera agent credentials');
    }
    return agent;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private validatePlaybackBaseUrl(value: string) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException('Agent playbackBaseUrl must be an absolute HTTP(S) URL');
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname !== '/' && parsed.pathname !== '')
    ) {
      throw new BadRequestException('Agent playbackBaseUrl must be an HTTP(S) origin without credentials or a path');
    }
    return parsed.origin;
  }
}
