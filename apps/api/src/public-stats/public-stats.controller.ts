import { Controller, Get } from '@nestjs/common';
import { ServerStatus, AccountStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';

export interface PublicStatsDto {
  hostedAccounts: number;
  domains: number;
  activeNodes: number;
}

/**
 * O-5 — public trust signals (no auth). Real counts for landing/login social
 * proof ("X stron hostowanych"). Cached briefly to avoid hammering the DB.
 */
@Controller('public/stats')
export class PublicStatsController {
  private cache: { at: number; data: PublicStatsDto } | null = null;
  private readonly ttlMs = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(): Promise<PublicStatsDto> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.data;
    const [hostedAccounts, domains, activeNodes] = await Promise.all([
      this.prisma.account.count({ where: { status: AccountStatus.ACTIVE } }),
      this.prisma.domain.count(),
      this.prisma.server.count({ where: { status: ServerStatus.ACTIVE } }),
    ]);
    const data: PublicStatsDto = { hostedAccounts, domains, activeNodes };
    this.cache = { at: Date.now(), data };
    return data;
  }
}
