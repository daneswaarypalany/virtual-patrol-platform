import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Configure CORS before requests reach the application's routes.
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'https://virtual-patrol-platform-8ib6.vercel.app',
      'https://virtual-patrol-platform-6bfc.vercel.app',
    ],
    credentials: true,
  });

  // Parse HTTP-only authentication cookies before protected routes run.
  app.use(cookieParser());

  // Apply validation to incoming DTOs.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );

  // Do not publicly serve uploads or generated HLS streams as static files.
  // Patrol screenshots are delivered through authenticated API routes.
  // HLS streams are delivered through the protected stream controller.

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();