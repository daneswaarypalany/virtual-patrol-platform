import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole } from '@prisma/client';

const safeUserSelect = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  role: true,
  status: true,
  createdAt: true,
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: safeUserSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: safeUserSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto) {
    if (dto.role === UserRole.ADMIN) {
      throw new BadRequestException('Cannot create ADMIN accounts here');
    }

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }] },
    });
    if (existing) {
      throw new ConflictException('Username or email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        role: dto.role,
      },
      select: safeUserSelect,
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: safeUserSelect,
    });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { status: 'INACTIVE' },
      select: safeUserSelect,
    });
  }

  async reactivate(id: string) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE' },
      select: safeUserSelect,
    });
  }

    async resetPassword(id: string, newPassword: string) {
    await this.findOne(id); // 404 if user doesn't exist
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
    return { message: 'Password reset successfully' };
  }

  async getAssignedSites(userId: string) {
  await this.findOne(userId)

  const assignments = await this.prisma.operatorSiteAssignment.findMany({
    where: { userId },
    orderBy: {
      site: {
        name: 'asc',
      },
    },
    include: {
      site: {
        select: {
          id: true,
          name: true,
          address: true,
          timezone: true,
          isActive: true,
        },
      },
    },
  })

  return assignments.map((assignment) => assignment.site)
}

}