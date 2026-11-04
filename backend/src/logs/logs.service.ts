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

type UserTrendDayUserRow = {
  username: string;
  fullName: string;
  role: string;
  actionCount: number;
  loginCount: number;
  lastActivityAt: number;
  loginTimestamps: unknown;
};

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

  /**
   * Daily user trend for the admin activity page. Counts only distinct users
   * who generated audit events; presence status is shown separately by
   * activeUsers(). The SQL fills quiet days with zeroes so the chart stays
   * continuous and aggregates in the database rather than downloading logs.
   */
  async userTrend(daysInput?: string) {
    const requestedDays = Number.parseInt(daysInput ?? '14', 10);
    const days = Math.min(30, Math.max(7, Number.isFinite(requestedDays) ? requestedDays : 14));
    const offsetDays = days - 1;

    const rows = await this.prisma.$queryRaw<
      Array<{ day: string; activeUsers: number; activities: number }>
    >(Prisma.sql`
      WITH selected_days AS (
        SELECT generate_series(
          date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - (${offsetDays} * INTERVAL '1 day'),
          date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
          INTERVAL '1 day'
        ) AS day
      ), daily_counts AS (
        SELECT
          date_trunc('day', "createdAt") AS day,
          COUNT(DISTINCT "userId")::int AS "activeUsers",
          COUNT(*)::int AS activities
        FROM "AuditLog"
        WHERE "createdAt" >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - (${offsetDays} * INTERVAL '1 day')
        GROUP BY date_trunc('day', "createdAt")
      )
      SELECT
        to_char(selected_days.day, 'YYYY-MM-DD') AS day,
        COALESCE(daily_counts."activeUsers", 0)::int AS "activeUsers",
        COALESCE(daily_counts.activities, 0)::int AS activities
      FROM selected_days
      LEFT JOIN daily_counts ON daily_counts.day = selected_days.day
      ORDER BY selected_days.day ASC
    `);

    return rows.map((row) => ({
      day: row.day,
      activeUsers: Number(row.activeUsers),
      activities: Number(row.activities),
    }));
  }

  /**
   * Per-user audit summary for one UTC-calendar day, loaded on demand when an
   * admin hovers or focuses a point in the user trend chart. Only display-safe
   * identity fields, action counts, and login timestamps are returned.
   */
  async userTrendDayUsers(dayInput?: string) {
    const day = dayInput?.trim() ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new BadRequestException('A valid day is required in YYYY-MM-DD format.');
    }
    const parsedDay = new Date(`${day}T00:00:00.000Z`);
    if (Number.isNaN(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== day) {
      throw new BadRequestException('The requested trend day is invalid.');
    }

    const rows = await this.prisma.$queryRaw<UserTrendDayUserRow[]>(Prisma.sql`
      SELECT
        COALESCE(u."username", 'unknown') AS username,
        COALESCE(u."fullName", 'Deleted user') AS "fullName",
        COALESCE(u."role"::text, 'UNKNOWN') AS role,
        COUNT(*)::int AS "actionCount",
        COUNT(*) FILTER (WHERE a."action" = 'LOGIN')::int AS "loginCount",
        (EXTRACT(EPOCH FROM MAX(a."createdAt")) * 1000)::double precision AS "lastActivityAt",
        COALESCE(
          json_agg(
            (EXTRACT(EPOCH FROM a."createdAt") * 1000)::double precision
            ORDER BY a."createdAt"
          ) FILTER (WHERE a."action" = 'LOGIN'),
          '[]'::json
        ) AS "loginTimestamps"
      FROM "AuditLog" a
      LEFT JOIN "User" u ON u."id" = a."userId"
      WHERE a."userId" IS NOT NULL
        AND a."createdAt" >= ${day}::date
        AND a."createdAt" < (${day}::date + INTERVAL '1 day')
      GROUP BY a."userId", u."username", u."fullName", u."role"
      ORDER BY MAX(a."createdAt") DESC, u."fullName" ASC
    `);

    return rows.map((row) => ({
      username: row.username,
      fullName: row.fullName,
      role: row.role,
      actionCount: Number(row.actionCount),
      loginCount: Number(row.loginCount),
      lastActivityAt: Number(row.lastActivityAt),
      loginTimestamps: Array.isArray(row.loginTimestamps)
        ? row.loginTimestamps.map((value) => Number(value)).filter(Number.isFinite)
        : [],
    }));
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