import {
  Controller,
  Get,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StreamsService } from './streams.service';

// Any authenticated role (ADMIN/OPERATOR/VIEWER) can watch a feed during a
// patrol, so this only requires login -- not the ADMIN-only guard used on
// CamerasController for managing camera records.
@Controller('cameras/:id/stream')
@UseGuards(JwtAuthGuard)
export class StreamsController {
  constructor(private streamsService: StreamsService) {}

  @Get()
  async getStream(@Param('id') id: string) {
    try {
      return await this.streamsService.getPlaybackUrl(id);
    } catch (err: any) {
      const status =
        err instanceof HttpException ? err.getStatus() : HttpStatus.BAD_GATEWAY;
      throw new HttpException(err.message || 'Failed to start stream', status);
    }
  }
}