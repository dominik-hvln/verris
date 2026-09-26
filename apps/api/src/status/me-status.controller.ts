import { Controller, Get, HttpCode, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  StatusService,
  maintenanceVisibleWhere,
  toPublicMaintenanceDto,
  type PublicMaintenanceDto,
} from './status.service.js';

/** N-11 — ogłoszenia widać w panelu przez 30 dni od publikacji (albo do expiresAt / archiwizacji). */
export const ANNOUNCEMENT_VISIBLE_DAYS = 30;

interface UserNoticesDto {
  announcements: Array<{ id: string; kind: string; title: string; bodyMarkdown: string; publishedAt: string }>;
  maintenance: PublicMaintenanceDto[];
}

interface UserIncidentDto {
  serverId: string;
  serverName: string;
  probeKind: string;
  probeTarget: string;
  severity: 'MINOR' | 'MAJOR';
  title: string;
  startedAt: string;
}

/**
 * H-8: feeds the dashboard banner shown to the customer when ANY of their
 * accounts lives on a server with an open incident. We deliberately do NOT
 * rely on the cached `GET /status` payload — that endpoint is anonymous and
 * shows everything. Here we want a tight, per-user query that:
 *   1. Resolves the user's accounts → distinct serverIds
 *   2. For each serverId, asks `StatusService.findActiveIncidentForServer`
 *
 * Auth: any logged-in user (JwtAuthGuard). Authorisation is implicit — the
 * query only joins through their own accounts.
 */
@Controller('me/status')
@UseGuards(JwtAuthGuard)
export class MeStatusController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly status: StatusService,
  ) {}

  @Get('incidents')
  @HttpCode(200)
  async listForCurrentUser(
    @CurrentUser() user: { userId: string },
  ): Promise<UserIncidentDto[]> {
    const accounts = await this.prisma.account.findMany({
      where: { userId: user.userId },
      select: { serverId: true },
    });
    const serverIds = Array.from(new Set(accounts.map((a) => a.serverId)));
    if (serverIds.length === 0) return [];

    const incidents = await Promise.all(
      serverIds.map((id) => this.status.findActiveIncidentForServer(id)),
    );

    return incidents
      .filter((i): i is NonNullable<typeof i> => i !== null)
      .map((i) => ({
        serverId: i.serverId,
        serverName: i.serverName,
        probeKind: String(i.probeKind),
        probeTarget: i.probeTarget,
        severity: i.severity,
        title: i.title,
        startedAt: i.startedAt,
      }));
  }

  /** N-11 — ogłoszenia dla klientów i prace serwisowe dotyczące serwerów tego użytkownika. */
  @Get('notices')
  @HttpCode(200)
  async noticesForCurrentUser(@CurrentUser() user: { userId: string }): Promise<UserNoticesDto> {
    const now = new Date();
    const accounts = await this.prisma.account.findMany({
      where: { userId: user.userId },
      select: { serverId: true },
    });
    const serverIds = Array.from(new Set(accounts.map((a) => a.serverId)));
    const [announcements, maintenance] = await Promise.all([
      this.prisma.productAnnouncement.findMany({
        where: {
          status: 'PUBLISHED',
          publishedAt: { lte: now, gte: new Date(now.getTime() - ANNOUNCEMENT_VISIBLE_DAYS * 86400000) },
          OR: [{ audienceRole: null }, { audienceRole: 'USER' }],
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
        },
        orderBy: { publishedAt: 'desc' },
        take: 5,
        select: { id: true, kind: true, title: true, bodyMarkdown: true, publishedAt: true },
      }),
      this.prisma.maintenanceWindow.findMany({
        where: maintenanceVisibleWhere(now, serverIds),
        orderBy: { scheduledStart: 'asc' },
        take: 10,
        include: { server: { select: { name: true } } },
      }),
    ]);
    return {
      announcements: announcements.map((a) => ({
        id: a.id,
        kind: String(a.kind),
        title: a.title,
        bodyMarkdown: a.bodyMarkdown,
        publishedAt: (a.publishedAt ?? now).toISOString(),
      })),
      maintenance: maintenance.map(toPublicMaintenanceDto),
    };
  }
}
