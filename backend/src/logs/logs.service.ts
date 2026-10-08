import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../presence/presence.service';
import { ACTION_LABELS } from '../audit/audit.service';

export interface LogsQuery {
  page?: string;
  pageSize?: string;
  action?: string;
  userId?: string;
  search?: string;
  from?: string;
  to?: string;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

function parseDate(value: string | undefined, label: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Invalid "${label}" date`);
  }
  return d;
}

@Injectable()
export class LogsService {
  constructor(
    private prisma: PrismaService,
    private presence: PresenceService,
  ) {}

  async activeUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        lastLoginAt: true,
        lastActiveAt: true,
      },
      orderBy: { fullName: 'asc' },
    });

    const online = new Set(this.presence.getOnlineUserIds());

    return users
      .map((u) => ({ ...u, online: online.has(u.id) }))
      .sort((a, b) => Number(b.online) - Number(a.online));
  }

  async actions() {
    const rows = await this.prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });
    return rows.map((r) => r.action);
  }

  async list(query: LogsQuery) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(query.pageSize ?? '', 10) || DEFAULT_PAGE_SIZE),
    );

    const from = parseDate(query.from, 'from');
    const to = parseDate(query.to, 'to');

    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.userId) where.userId = query.userId;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      // Let people search by the friendly label ("patrol", "report") as well
      // as the stored action code.
      const labelMatches = Object.entries(ACTION_LABELS)
        .filter(([, label]) => label.toLowerCase().includes(q.toLowerCase()))
        .map(([code]) => code);
      where.OR = [
        { action: { contains: q, mode: 'insensitive' } },
        ...(labelMatches.length ? [{ action: { in: labelMatches } }] : []),
        { entity: { contains: q, mode: 'insensitive' } },
        { entityId: { contains: q, mode: 'insensitive' } },
        { details: { contains: q, mode: 'insensitive' } },
        { user: { username: { contains: q, mode: 'insensitive' } } },
        { user: { fullName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: { id: true, username: true, fullName: true, role: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }
}