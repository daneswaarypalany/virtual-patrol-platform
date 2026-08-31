# ============================================================
# Virtual Patrol - Module A auth setup
# Run this from the backend folder:  cd backend  then  .\setup-auth.ps1
# It deletes any fake folders named like .ts files, then creates
# all 12 auth/prisma files with the correct content.
# ============================================================

Write-Host "Cleaning up fake folders..." -ForegroundColor Cyan

# Remove fake folders (named like .ts files) if they exist
$fakeFolders = @(
  "src\prisma\prisma.module.ts",
  "src\prisma\prisma.service.ts",
  "src\auth\auth.controller.ts",
  "src\auth\auth.module.ts",
  "src\auth\auth.service.ts",
  "src\auth\jwt.strategy.ts",
  "src\auth\decorators\roles.decorator.ts",
  "src\auth\guards\jwt-auth.guard.ts",
  "src\auth\guards\roles.guard.ts",
  "src\auth\dto\login.dto.ts",
  "src\auth\dto\register.dto.ts"
)

foreach ($f in $fakeFolders) {
  if (Test-Path $f -PathType Container) {
    Remove-Item $f -Recurse -Force
    Write-Host "  removed fake folder: $f" -ForegroundColor Yellow
  }
}

Write-Host "Creating real folders..." -ForegroundColor Cyan

# Ensure the real directories exist
$dirs = @("src\prisma", "src\auth", "src\auth\dto", "src\auth\guards", "src\auth\decorators")
foreach ($d in $dirs) {
  if (-not (Test-Path $d -PathType Container)) {
    New-Item -ItemType Directory -Path $d -Force | Out-Null
  }
}

Write-Host "Writing files..." -ForegroundColor Cyan

# ---------- prisma.service.ts ----------
@'
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
'@ | Set-Content -Path "src\prisma\prisma.service.ts" -Encoding UTF8

# ---------- prisma.module.ts ----------
@'
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
'@ | Set-Content -Path "src\prisma\prisma.module.ts" -Encoding UTF8

# ---------- login.dto.ts ----------
@'
import { IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
'@ | Set-Content -Path "src\auth\dto\login.dto.ts" -Encoding UTF8

# ---------- register.dto.ts ----------
@'
import { IsString, IsNotEmpty, IsEmail, MinLength } from 'class-validator';

// TEMPORARY - bootstraps the first admin only. Remove before finishing Module A.
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;
}
'@ | Set-Content -Path "src\auth\dto\register.dto.ts" -Encoding UTF8

# ---------- jwt.strategy.ts ----------
@'
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const cookieExtractor = (req: Request): string | null => {
  return req?.cookies?.access_token ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: { sub: string; role: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    };
  }
}
'@ | Set-Content -Path "src\auth\jwt.strategy.ts" -Encoding UTF8

# ---------- guards/jwt-auth.guard.ts ----------
@'
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
'@ | Set-Content -Path "src\auth\guards\jwt-auth.guard.ts" -Encoding UTF8

# ---------- decorators/roles.decorator.ts ----------
@'
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
'@ | Set-Content -Path "src\auth\decorators\roles.decorator.ts" -Encoding UTF8

# ---------- guards/roles.guard.ts ----------
@'
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../../generated/prisma';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user.role);
  }
}
'@ | Set-Content -Path "src\auth\guards\roles.guard.ts" -Encoding UTF8

# ---------- auth.service.ts ----------
@'
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserRole } from '../../generated/prisma';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.jwt.signAsync({ sub: user.id, role: user.role });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  // TEMPORARY - only works when the DB has zero users.
  async registerFirstAdmin(dto: RegisterDto) {
    const count = await this.prisma.user.count();
    if (count > 0) {
      throw new ForbiddenException(
        'Registration is disabled. Admins create users.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        role: UserRole.ADMIN,
      },
    });

    return { id: user.id, username: user.username, role: user.role };
  }
}
'@ | Set-Content -Path "src\auth\auth.service.ts" -Encoding UTF8

# ---------- auth.controller.ts ----------
@'
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
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.authService.login(dto);

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    return { user };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token');
    return { message: 'Logged out' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    return { user: req.user };
  }

  // TEMPORARY bootstrap endpoint - DELETE before Module A is complete
  @Post('register')
  @HttpCode(201)
  register(@Body() dto: RegisterDto) {
    return this.authService.registerFirstAdmin(dto);
  }
}
'@ | Set-Content -Path "src\auth\auth.controller.ts" -Encoding UTF8

# ---------- auth.module.ts ----------
@'
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
'@ | Set-Content -Path "src\auth\auth.module.ts" -Encoding UTF8

Write-Host ""
Write-Host "Done. All 12 files created." -ForegroundColor Green
Write-Host "Now run:  npm run start:dev" -ForegroundColor Green
