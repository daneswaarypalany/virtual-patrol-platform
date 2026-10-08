import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';
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
      const result = await this.streamsService.getPlaybackUrl(id);
      await this.audit.cameraViewed((req.user as any).id, id);
      return result;
    } catch (err: any) {
      const status =
        err instanceof HttpException ? err.getStatus() : HttpStatus.BAD_GATEWAY;
      throw new HttpException(err.message || 'Failed to start stream', status);
    }
  }
}