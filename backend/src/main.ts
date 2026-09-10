import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // CORS must be registered BEFORE the static asset middleware below.
  // Express runs middleware in registration order, and static file serving
  // responds to matching requests immediately without CORS headers if it
  // runs first -- <img> tags tolerate that, but hls.js's video fetches (used
  // for the live camera feeds) are strict XHR/fetch requests and get
  // silently blocked cross-origin without this being set up first.
  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
  });

  // Resolved relative to process.cwd() (the directory you run the backend
  // from, e.g. "backend/") rather than __dirname -- this matches the same
  // approach already used successfully in patrol.service.ts when embedding
  // screenshots into generated PDF reports, and avoids depending on the
  // compiled output folder depth (which shifts depending on what else gets
  // picked up by the TypeScript build, e.g. prisma.config.ts living next to src/).
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  // Live HLS playlists/segments generated on the fly from camera RTSP links
  // (see StreamsService). No-cache so players always see fresh segments.
  app.useStaticAssets(join(process.cwd(), 'streams'), {
    prefix: '/streams',
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
  });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();