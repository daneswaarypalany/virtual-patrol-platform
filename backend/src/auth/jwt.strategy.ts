import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const cookieExtractor = (req: Request): string | null => {
  return req?.cookies?.access_token ?? null;
};

// Throttles the lastActiveAt DB write to at most once per user per this
// window, since validate() runs on every authenticated request.
const ACTIVITY_TOUCH_INTERVAL_MS = 60_000;
const lastTouchByUserId = new Map<string, number>();

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') as string,
    });
  }

  async validate(payload: { sub: string; role: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }

    const now = Date.now();
    const last = lastTouchByUserId.get(user.id) ?? 0;
    if (now - last > ACTIVITY_TOUCH_INTERVAL_MS) {
      lastTouchByUserId.set(user.id, now);
      // Fire-and-forget: don't make every request wait on this write.
      this.prisma.user
        .update({
          where: { id: user.id },
          data: { lastActiveAt: new Date() },
        })
        .catch(() => {
          // non-critical — if this fails, the next request retries it
        });
    }

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    };
  }
}