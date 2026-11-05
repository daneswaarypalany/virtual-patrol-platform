import { BadGatewayException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { spawn, ChildProcess } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
const ffmpegStaticPath = require('ffmpeg-static') as string | null;

interface RunningStream {
  process: ChildProcess;
  lastAccessed: number;
  ready: boolean;
  lastError: string | null;
}

// Where the generated HLS segments/playlists live. Served statically from
// main.ts under the `/streams` prefix.
const STREAMS_DIR = process.env.VERCEL
  ? join('/tmp', 'streams')
  : join(process.cwd(), 'streams');

// Kill the ffmpeg process for a camera if nobody has requested its playlist
// for this long. Keeps us from running a transcode per camera forever.
const IDLE_TIMEOUT_MS = 60_000;

// How long we're willing to wait for ffmpeg to connect to the camera and
// produce the first HLS segment before giving up and reporting an error.
const READY_TIMEOUT_MS = 20_000;

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
  private readonly logger = new Logger(StreamsService.name);
  private running = new Map<string, RunningStream>();
  // External HLS child URLs stay on the server; clients receive opaque refs.
  // Every reference is bound to its user and is re-authorized on each request.
  private proxyAssetRefs = new Map<string, ProxyAssetReference>();

  constructor(private prisma: PrismaService) {
    if (!existsSync(STREAMS_DIR)) mkdirSync(STREAMS_DIR, { recursive: true });
    setInterval(() => this.reapIdle(), 15_000).unref();
  }

  /**
   * Resolve whatever the admin typed into the "Stream URL" field into
   * something a <video> element (via hls.js) can actually play.
   *
   * - rtsp:// / rtsps:// links get transcoded on the fly to HLS via ffmpeg.
   * - http(s):// links are proxied through an authenticated endpoint so the
   *   raw camera URL never reaches an operator/viewer browser. The proxy checks
   *   the current site assignment on every request, including HLS segments.
   */
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
    });
    if (!camera) throw new NotFoundException('Camera not found');
    if (!camera.streamUrl?.trim()) {
      throw new NotFoundException('Camera has no stream URL configured');
    }

    const src = camera.streamUrl.trim();

    if (/^https?:\/\//i.test(src)) {
      return { url: `/cameras/${encodeURIComponent(cameraId)}/stream/proxy`, mode: 'proxy' };
    }

    if (!/^rtsps?:\/\//i.test(src)) {
      throw new NotFoundException(
        'Stream URL must start with rtsp://, rtsps://, http:// or https://',
      );
    }

    await this.ensureRunning(cameraId, src);
    return { url: `/streams/${cameraId}/index.m3u8`, mode: 'proxy' };
  }

  /**
   * Authenticated proxy for HTTP(S) camera sources. It deliberately does not
   * return the configured URL to the browser. Live playlists are rewritten so
   * each child playlist, key, and segment comes back through this same endpoint
   * and must pass the current assignment check again.
   */
  async getDirectStreamAsset(
    cameraId: string,
    user: { id: string; role: string },
    ref?: string,
    range?: string,
  ): Promise<DirectStreamProxyResult> {
    await this.assertCameraAccess(cameraId, user);

    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
      select: { streamUrl: true },
    });
    const configuredUrl = camera?.streamUrl?.trim();
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

  /** Called on every poll so an idle-active stream isn't reaped mid-watch. */
  touch(cameraId: string) {
    const entry = this.running.get(cameraId);
    if (entry) entry.lastAccessed = Date.now();
  }

  private async ensureRunning(cameraId: string, rtspUrl: string) {
    const existing = this.running.get(cameraId);
    if (existing) {
      existing.lastAccessed = Date.now();
      if (existing.ready) return;
    } else {
      this.spawnFfmpeg(cameraId, rtspUrl);
    }
    await this.waitUntilReady(cameraId);
  }

  private spawnFfmpeg(cameraId: string, rtspUrl: string) {
    const outDir = join(STREAMS_DIR, cameraId);
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    const playlist = join(outDir, 'index.m3u8');
    // NOTE: segments are named .tsdata, NOT .ts -- the standard HLS/ffmpeg
    // segment extension is .ts ("Transport Stream"), which collides with
    // TypeScript source files and can confuse editors/compilers watching
    // this project folder. hls.js doesn't care about the extension, only
    // about the URL listed in the .m3u8 playlist, so this is safe.
    const segmentPattern = join(outDir, 'segment%03d.tsdata');

    // -rtsp_transport tcp: most IP cameras behave far better over TCP than
    // the UDP default, especially through NAT/firewalls.
    // -tune zerolatency + short hls_time: keep patrol-view latency low.
    const args = [
      '-rtsp_transport',
      'tcp',
      '-i',
      rtspUrl,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-tune',
      'zerolatency',
      '-g',
      '50',
      '-f',
      'hls',
      '-hls_time',
      '2',
      '-hls_list_size',
      '4',
      '-hls_flags',
      'delete_segments+omit_endlist+independent_segments',
      '-hls_segment_filename',
      segmentPattern,
      playlist,
    ];

    this.logger.log(`Starting ffmpeg for camera ${cameraId}`);
    const ffmpegExecutable =
  process.env.FFMPEG_PATH?.trim() || ffmpegStaticPath;

if (!ffmpegExecutable) {
  throw new Error(
    'FFmpeg executable not found. Check the ffmpeg-static installation.',
  );
}

this.logger.log(`Using FFmpeg executable: ${ffmpegExecutable}`);

const proc = spawn(ffmpegExecutable, args, {
  stdio: ['ignore', 'ignore', 'pipe'],
});

    const entry: RunningStream = {
      process: proc,
      lastAccessed: Date.now(),
      ready: false,
      lastError: null,
    };
    this.running.set(cameraId, entry);

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (!entry.ready && existsSync(playlist)) entry.ready = true;
      entry.lastError = text.trim().split('\n').pop() ?? entry.lastError;
    });

    proc.on('error', (err) => {
      this.logger.error(`ffmpeg failed to start for camera ${cameraId}: ${err.message}`);
      this.running.delete(cameraId);
    });

    proc.on('exit', (code, signal) => {
      this.logger.log(
        `ffmpeg for camera ${cameraId} exited (code=${code}, signal=${signal})`,
      );
      this.running.delete(cameraId);
    });
  }

  private waitUntilReady(cameraId: string): Promise<void> {
    const playlist = join(STREAMS_DIR, cameraId, 'index.m3u8');
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
      const check = () => {
        const entry = this.running.get(cameraId);
        if (!entry) {
          return reject(new Error('Could not connect to the camera stream'));
        }
        if (existsSync(playlist)) return resolve();
        if (Date.now() - startedAt > READY_TIMEOUT_MS) {
          entry.process.kill('SIGTERM');
          this.running.delete(cameraId);
          return reject(
            new Error(
              entry.lastError
                ? `Could not connect to the camera stream: ${entry.lastError}`
                : 'Timed out connecting to the camera stream',
            ),
          );
        }
        setTimeout(check, 300);
      };
      check();
    });
  }

  private reapIdle() {
    const now = Date.now();
    for (const [cameraId, entry] of this.running.entries()) {
      if (now - entry.lastAccessed > IDLE_TIMEOUT_MS) {
        this.logger.log(`Stopping idle stream for camera ${cameraId}`);
        entry.process.kill('SIGTERM');
        this.running.delete(cameraId);
        rmSync(join(STREAMS_DIR, cameraId), { recursive: true, force: true });
      }
    }
  }
}