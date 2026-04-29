import { Controller, Get, HttpCode, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { StatusService } from './status.service';

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
}
