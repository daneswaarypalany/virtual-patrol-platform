import { BadGatewayException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CameraAgentsService } from '../camera-agents/camera-agents.service';
import {
  decryptStreamUrl,
  encryptStreamUrl,
  getCameraStreamPath,
  isRtspUrl,
} from '../common/stream-crypto';

interface ProxyAssetReference {
  cameraId: string;
  userId: string;
  rootUrl: string;
  url: string;
  expiresAt: number;
}

export type DirectStreamProxyResult =
  | { kind: 'playlist'; status: number; contentType: string; body: string }
  | {
      kind: 'stream';
      status: number;
      contentType: string;
      contentLength: string | null;
      contentRange: string | null;
      acceptRanges: string | null;
      body: ReadableStream<Uint8Array> | null;
    };

const PROXY_REFERENCE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class StreamsService {
  // External HLS child URLs stay server-side; clients receive opaque references
  // bound to their user and camera, and each segment request is re-authorized.
  private proxyAssetRefs = new Map<string, ProxyAssetReference>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly agents: CameraAgentsService,
  ) {}

  async assertCameraAccess(
    cameraId: string,
    user: { id: string; role: string },
  ): Promise<void> {
    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
      select: { id: true, siteId: true },
    });
    if (!camera) throw new NotFoundException('Camera not found');
    if (user.role === 'ADMIN') return;

    const assignment = await this.prisma.operatorSiteAssignment.findUnique({
      where: { userId_siteId: { userId: user.id, siteId: camera.siteId } },
      select: { id: true },
    });
    if (!assignment) throw new NotFoundException('Camera not found');
  }

  async getPlaybackUrl(
    cameraId: string,
    user: { id: string; role: string },
  ): Promise<{ url: string; mode: 'proxy' | 'direct' }> {
    await this.assertCameraAccess(cameraId, user);
    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
      select: {
        id: true,
        siteId: true,
        streamUrl: true,
        streamUrlEncrypted: true,
        streamVersion: true,
      },
    });
    if (!camera) throw new NotFoundException('Camera not found');

    let source = decryptStreamUrl(camera.streamUrlEncrypted || camera.streamUrl);
    if (!source?.trim()) {
      throw new NotFoundException('Camera has no stream URL configured');
    }
    source = source.trim();

    if (/^https?:\/\//i.test(source)) {
      return {
        url: `/cameras/${encodeURIComponent(cameraId)}/stream/proxy`,
        mode: 'proxy',
      };
    }

    if (!isRtspUrl(source)) {
      throw new NotFoundException('Stream URL must start with rtsp://, rtsps://, http:// or https://');
    }

    // Convert legacy plaintext records the first time they are used, then
    // queue the RTSP source for the site's local MediaMTX agent.
    if (!camera.streamUrlEncrypted && camera.streamUrl) {
      const nextVersion = camera.streamVersion + 1;
      await this.prisma.camera.update({
        where: { id: cameraId },
        data: {
          streamUrl: null,
          streamUrlEncrypted: encryptStreamUrl(source),
          streamVersion: nextVersion,
        },
      });
      await this.agents.queueLegacyCamera(cameraId, camera.siteId, nextVersion);
    }

    const playbackBaseUrl = await this.agents.getAgentPlaybackBaseUrl(camera.siteId);
    if (!playbackBaseUrl) {
      throw new ServiceUnavailableException(
        'The camera streaming agent for this site is offline or has not been configured',
      );
    }

    const path = getCameraStreamPath(cameraId);
    return {
      url: `${playbackBaseUrl}/${path}/index.m3u8`,
      mode: 'direct',
    };
  }

  async getDirectStreamAsset(
    cameraId: string,
    user: { id: string; role: string },
    ref?: string,
    range?: string,
  ): Promise<DirectStreamProxyResult> {
    await this.assertCameraAccess(cameraId, user);

    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
      select: { streamUrl: true, streamUrlEncrypted: true },
    });
    const configuredUrl = decryptStreamUrl(camera?.streamUrlEncrypted || camera?.streamUrl)?.trim();
    if (!configuredUrl) throw new NotFoundException('Camera stream not found');

    let root: URL;
    try {
      root = new URL(configuredUrl);
    } catch {
      throw new NotFoundException('Camera stream not found');
    }
    if (root.protocol !== 'http:' && root.protocol !== 'https:') {
      throw new NotFoundException('HTTP camera stream not found');
    }

    let target = root;
    if (ref) {
      const reference = this.proxyAssetRefs.get(ref);
      if (
        !reference ||
        reference.expiresAt < Date.now() ||
        reference.cameraId !== cameraId ||
        reference.userId !== user.id ||
        reference.rootUrl !== configuredUrl
      ) {
        this.proxyAssetRefs.delete(ref);
        throw new NotFoundException('Camera stream asset not found');
      }
      try {
        target = new URL(reference.url);
      } catch {
        throw new NotFoundException('Camera stream asset not found');
      }
    }

    // Never allow a manifest reference to turn this endpoint into a generic
    // URL fetcher. Child assets must stay on the configured stream's origin.
    if (
      (target.protocol !== 'http:' && target.protocol !== 'https:') ||
      target.origin !== root.origin
    ) {
      throw new NotFoundException('Camera stream asset not found');
    }

    const headers: Record<string, string> = {};
    if (range && /^bytes=\d*-\d*(,\d*-\d*)*$/.test(range)) {
      headers.Range = range;
    }

    // Keep credentials server-side and send Basic auth through a header; the
    // Fetch API rejects URLs containing user:password, and those credentials
    // must never be copied into the browser-visible proxy URL.
    const requestTarget = new URL(target.toString());
    if (requestTarget.username || requestTarget.password) {
      const username = decodeURIComponent(requestTarget.username);
      const password = decodeURIComponent(requestTarget.password);
      headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      requestTarget.username = '';
      requestTarget.password = '';
    }

    let upstream: Response;
    try {
      upstream = await fetch(requestTarget, { headers, redirect: 'manual' });
    } catch {
      throw new BadGatewayException('Could not connect to the camera stream');
    }
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel().catch(() => undefined);
      throw new BadGatewayException('Camera stream redirects are not supported');
    }
    if (!upstream.ok && upstream.status !== 206) {
      await upstream.body?.cancel().catch(() => undefined);
      throw new BadGatewayException(`Camera stream returned HTTP ${upstream.status}`);
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const isPlaylist = /mpegurl|x-mpegurl/i.test(contentType) || /\.m3u8$/i.test(target.pathname);
    if (isPlaylist) {
      const text = await upstream.text();
      const proxyAsset = (asset: string) => {
        const value = asset.trim();
        if (!value || value.startsWith('data:')) return value;
        let resolved: URL;
        try {
          resolved = new URL(value, target);
        } catch {
          throw new NotFoundException('Invalid camera playlist asset');
        }
        if (resolved.origin !== root.origin || !['http:', 'https:'].includes(resolved.protocol)) {
          throw new NotFoundException('Camera playlist references an external asset');
        }
        // Some camera playlists require a query token for relative assets.
        if (!resolved.search && target.search) resolved.search = target.search;
        const token = randomUUID();
        this.proxyAssetRefs.set(token, {
          cameraId,
          userId: user.id,
          rootUrl: configuredUrl,
          url: resolved.toString(),
          expiresAt: Date.now() + PROXY_REFERENCE_TTL_MS,
        });
        return `/cameras/${encodeURIComponent(cameraId)}/stream/proxy?ref=${encodeURIComponent(token)}`;
      };

      const rewritten = text
        .split(/\r?\n/)
        .map((line) => {
          if (!line.trim()) return line;
          if (line.trimStart().startsWith('#')) {
            return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${proxyAsset(uri)}"`);
          }
          return proxyAsset(line);
        })
        .join('\n');

      // Remove expired refs opportunistically to bound memory use.
      const now = Date.now();
      for (const [token, value] of this.proxyAssetRefs) {
        if (value.expiresAt < now) this.proxyAssetRefs.delete(token);
      }

      return {
        kind: 'playlist',
        status: upstream.status === 206 ? 206 : 200,
        contentType: 'application/vnd.apple.mpegurl; charset=utf-8',
        body: rewritten,
      };
    }

    return {
      kind: 'stream',
      status: upstream.status,
      contentType,
      contentLength: upstream.headers.get('content-length'),
      contentRange: upstream.headers.get('content-range'),
      acceptRanges: upstream.headers.get('accept-ranges'),
      body: upstream.body,
    };
  }

}
