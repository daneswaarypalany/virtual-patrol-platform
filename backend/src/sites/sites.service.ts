import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.site.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { cameras: true, assignments: true } },
      },
    });
  }

  async findOne(id: string) {
    const site = await this.prisma.site.findUnique({
      where: { id },
      include: {
        _count: { select: { cameras: true, assignments: true } },
      },
    });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  create(dto: CreateSiteDto) {
    return this.prisma.site.create({ data: dto });
  }

  async update(id: string, dto: UpdateSiteDto) {
    await this.findOne(id);
    return this.prisma.site.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.site.delete({ where: { id } });
    return { message: 'Site deleted' };
  }

    // List operators assigned to a site
  async getAssignments(siteId: string) {
    await this.findOne(siteId);
    const assignments = await this.prisma.operatorSiteAssignment.findMany({
      where: { siteId },
      include: {
        user: {
          select: { id: true, username: true, fullName: true, role: true, status: true },
        },
      },
    });
    return assignments.map((a) => a.user);
  }

  // Assign an operator/viewer to a site
  async assignUser(siteId: string, userId: string) {
    await this.findOne(siteId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // upsert-style: ignore if already assigned (unique constraint protects us)
    await this.prisma.operatorSiteAssignment.upsert({
      where: { userId_siteId: { userId, siteId } },
      create: { userId, siteId },
      update: {},
    });

    return { message: 'User assigned to site' };
  }

  // Remove an operator/viewer from a site
  async unassignUser(siteId: string, userId: string) {
    await this.findOne(siteId);
    await this.prisma.operatorSiteAssignment.deleteMany({
      where: { siteId, userId },
    });
    return { message: 'User removed from site' };
  }
  
}
