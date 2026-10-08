import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

// The frontend and backend are deployed on different *.vercel.app domains,
// which browsers treat as different sites. A SameSite=Lax cookie is dropped
// on cross-site requests, so in production it must be SameSite=None (which
// requires Secure). Locally both run on localhost, where Lax is fine.
const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_BASE = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: (IS_PROD ? 'none' : 'lax') as 'none' | 'lax',
};

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.authService.login(dto);

    res.cookie('access_token', token, {
      ...COOKIE_BASE,
      maxAge: 15 * 60 * 1000,
    });

    return { user };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Best-effort: log who logged out if their cookie is still a valid,
    // unexpired token. Logout must still succeed (and clear the cookie)
    // even if the token already expired — that's the common case given
    // the 15-minute token lifetime, so this is never guarded.
    const token = req.cookies?.access_token as string | undefined;
    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, username: true },
        });
        if (user) {
          await this.prisma.auditLog.create({
            data: {
              action: 'LOGOUT',
              entity: 'User',
              entityId: user.id,
              userId: user.id,
              details: JSON.stringify({ username: user.username }),
            },
          });
        }
      } catch {
        // expired/invalid token — nothing to log, just clear the cookie below
      }
    }
    res.clearCookie('access_token', COOKIE_BASE);
    return { message: 'Logged out' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    return { user: req.user };
  }
}