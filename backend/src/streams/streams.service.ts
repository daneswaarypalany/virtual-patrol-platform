import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

interface RunningStream {
  process: ChildProcess;
  lastAccessed: number;
  ready: boolean;
  lastError: string | null;
}

// Where the generated HLS segments/playlists live. Served statically from
// main.ts under the `/streams` prefix.
const STREAMS_DIR = join(process.cwd(), 'streams');

// Kill the ffmpeg process for a camera if nobody has requested its playlist
// for this long. Keeps us from running a transcode per camera forever.
const IDLE_TIMEOUT_MS = 60_000;

// How long we're willing to wait for ffmpeg to connect to the camera and
// produce the first HLS segment before giving up and reporting an error.
const READY_TIMEOUT_MS = 20_000;

@Injectable()
export class StreamsService {
  private readonly logger = new Logger(StreamsService.name);
  private running = new Map<string, RunningStream>();

  constructor(private prisma: PrismaService) {
    if (!existsSync(STREAMS_DIR)) mkdirSync(STREAMS_DIR, { recursive: true });
    setInterval(() => this.reapIdle(), 15_000).unref();
  }

  /**
   * Resolve whatever the admin typed into the "Stream URL" field into
   * something a <video> element (via hls.js) can actually play.
   *
   * - rtsp:// / rtsps:// links get transcoded on the fly to HLS via ffmpeg.
   * - http(s):// links (already an .m3u8, mjpeg endpoint, etc.) pass through
   *   untouched, so existing setups (e.g. MediaMTX) keep working.
   */
  async getPlaybackUrl(
    cameraId: string,
  ): Promise<{ url: string; mode: 'proxy' | 'direct' }> {
    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
    });
    if (!camera) throw new NotFoundException('Camera not found');
    if (!camera.streamUrl?.trim()) {
      throw new NotFoundException('Camera has no stream URL configured');
    }

    const src = camera.streamUrl.trim();

    if (/^https?:\/\//i.test(src)) {
      return { url: src, mode: 'direct' };
    }

    if (!/^rtsps?:\/\//i.test(src)) {
      throw new NotFoundException(
        'Stream URL must start with rtsp://, rtsps://, http:// or https://',
      );
    }

    await this.ensureRunning(cameraId, src);
    return { url: `/streams/${cameraId}/index.m3u8`, mode: 'proxy' };
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
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });

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