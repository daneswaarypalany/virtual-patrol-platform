import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { StreamsService } from './streams.service';
import { AuditService } from '../audit/audit.service';

// Any authenticated role (ADMIN/OPERATOR/VIEWER) can watch a feed during a
// patrol, so this only requires login -- not the ADMIN-only guard used on
// CamerasController for managing camera records.
@Controller('cameras/:id/stream')
@UseGuards(JwtAuthGuard)
export class StreamsController {
  constructor(
    private streamsService: StreamsService,
    private audit: AuditService,
  ) {}

  @Get()
  async getStream(@Req() req: Request, @Param('id') id: string) {
    try {
      const result = await this.streamsService.getPlaybackUrl(id, req.user as any);
      await this.audit.cameraViewed((req.user as any).id, id);
      return result;
    } catch (err: any) {
      const status =
        err instanceof HttpException ? err.getStatus() : HttpStatus.BAD_GATEWAY;
      throw new HttpException(err.message || 'Failed to start stream', status);
    }
  }

  @Get('proxy')
  async proxyDirectStream(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('ref') ref: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const result = await this.streamsService.getDirectStreamAsset(
        id,
        req.user as any,
        ref,
        typeof req.headers.range === 'string' ? req.headers.range : undefined,
      );

      res.status(result.status);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', result.contentType);

      if (result.kind === 'playlist') {
        return res.send(result.body);
      }
      if (result.contentLength) res.setHeader('Content-Length', result.contentLength);
      if (result.contentRange) res.setHeader('Content-Range', result.contentRange);
      if (result.acceptRanges) res.setHeader('Accept-Ranges', result.acceptRanges);
      if (!result.body) return res.end();

      const upstream = Readable.fromWeb(result.body as any);
      let accessCheckInFlight = false;
      const cleanup = () => clearInterval(accessPoll);
      // Long-running MJPEG/MP4 responses must also stop promptly if a site
      // assignment is removed while the stream is already open.
      const accessPoll = setInterval(async () => {
        if (accessCheckInFlight || res.destroyed) return;
        accessCheckInFlight = true;
        try {
          await this.streamsService.assertCameraAccess(id, req.user as any);
        } catch {
          cleanup();
          upstream.destroy();
          if (!res.destroyed) res.end();
        } finally {
          accessCheckInFlight = false;
        }
      }, 5_000);
      accessPoll.unref?.();
      upstream.on('close', cleanup);
      upstream.on('end', cleanup);
      upstream.on('error', cleanup);
      res.on('close', cleanup);
      return upstream.pipe(res);
    } catch (err: any) {
      const status = err instanceof HttpException ? err.getStatus() : HttpStatus.BAD_GATEWAY;
      throw new HttpException(err?.message || 'Failed to proxy camera stream', status);
    }
  }

}