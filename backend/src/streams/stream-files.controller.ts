import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const STREAMS_DIR = process.env.VERCEL
  ? join('/tmp', 'streams')
  : join(process.cwd(), 'streams');

@Controller('streams')
@UseGuards(JwtAuthGuard)
export class StreamFilesController {
  @Get(':cameraId/:filename')
  getFile(
    @Param('cameraId') cameraId: string,
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    // Accept only expected camera IDs and generated HLS files.
    if (
      !/^[0-9a-fA-F-]{36}$/.test(cameraId) ||
      !/^(index\.m3u8|segment\d+\.tsdata)$/.test(filename)
    ) {
      throw new NotFoundException();
    }

    const filePath = join(STREAMS_DIR, cameraId, filename);

    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      throw new NotFoundException();
    }

    res.setHeader('Cache-Control', 'no-store');

    return new StreamableFile(createReadStream(filePath), {
      type:
        filename === 'index.m3u8'
          ? 'application/vnd.apple.mpegurl'
          : 'video/mp2t',
    });
  }
}